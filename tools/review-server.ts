// 한국어 뜻 검수 전용 로컬 화면. `npm run review` → http://localhost:5178
// korean-meaning-worklist*.tsv 를 한 건씩 보여주고 o/x/~/s + 뜻 직접 수정을 그 자리에서 TSV 에 쓴다.
// apply:korean-meaning 파이프라인은 그대로 (같은 파일을 읽고 씀).
// `npm run review -- batch-01` 처럼 파일명(일부만도 됨)을 주면 그 파일로 바로 연다.
import { createServer } from 'node:http'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

const PORT = 5178
const listFiles = () =>
  readdirSync(DICT_DIR)
    .filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f))
    .sort()

// CLI 인자로 처음 열 파일 지정 — `npm run review -- batch-01` (파일명 일부만 써도 됨)
const argFile = process.argv.slice(2).find((a) => !a.startsWith('-'))
function defaultFile(files: string[]): string | undefined {
  if (!files.length || !argFile) return files[0]
  const hit = files.find((f) => f === argFile) ?? files.find((f) => f.includes(argFile))
  if (!hit) console.warn(`'${argFile}' 에 맞는 워크리스트가 없다 — ${files[0]} 로 연다`)
  return hit ?? files[0]
}

function loadGrid(file: string) {
  const grid = readTsv(join(DICT_DIR, file))
  const header = grid[0]
  const col = Object.fromEntries(header.map((h, i) => [h, i]))
  const rows = grid.slice(1).filter((r) => r.length > 1 && r[col.id])
  return { header, col, rows }
}

/** id 로 행을 찾아 verdict·cat·llm_ko 를 갱신하고 파일 전체를 다시 쓴다 */
function saveRow(file: string, id: string, patch: { verdict?: string; cat?: string; llm_ko?: string }) {
  const { header, col, rows } = loadGrid(file)
  const row = rows.find((r) => r[col.id] === id)
  if (!row) throw new Error(`id ${id} 없음`)
  if (patch.verdict !== undefined) row[col.verdict] = patch.verdict
  if (patch.cat !== undefined) row[col.cat] = patch.cat
  if (patch.llm_ko !== undefined) row[col.llm_ko] = patch.llm_ko.replace(/[\t\r\n]+/g, ' ').trim()
  writeTsvBom(join(DICT_DIR, file), [header, ...rows].map((r) => r.join('\t')).join('\n') + '\n')
}

const DONE = /^[oxs~]$/
const stats = (file: string) => {
  const { col, rows } = loadGrid(file)
  const done = rows.filter((r) => DONE.test((r[col.verdict] ?? '').trim())).length
  return { total: rows.length, done }
}

const json = (res: import('node:http').ServerResponse, body: unknown, code = 200) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  try {
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(HTML)
      return
    }
    if (url.pathname === '/api/state') {
      const files = listFiles()
      const file = url.searchParams.get('file') && files.includes(url.searchParams.get('file')!)
        ? url.searchParams.get('file')!
        : defaultFile(files)
      if (!file) return json(res, { files: [], rows: [], header: [] })
      const { header, rows } = loadGrid(file)
      return json(res, { files, file, header, rows, ...stats(file) })
    }
    if (url.pathname === '/api/save' && req.method === 'POST') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        try {
          const { file, id, verdict, cat, llm_ko } = JSON.parse(raw) as Record<string, string>
          if (!listFiles().includes(file)) throw new Error('unknown file')
          saveRow(file, id, { verdict, cat, llm_ko })
          json(res, { ok: true, ...stats(file) })
        } catch (e) {
          json(res, { ok: false, error: String(e) }, 400)
        }
      })
      return
    }
    json(res, { error: 'not found' }, 404)
  } catch (e) {
    json(res, { error: String(e) }, 500)
  }
})

// 이미 떠 있으면(EADDRINUSE) 다음 포트로. 오래된 인스턴스가 남아 있어도 그냥 뜬다
function listen(port: number, triesLeft: number) {
  server.once('error', (e: NodeJS.ErrnoException) => {
    if (e.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`${port} 사용 중 — ${port + 1} 로`)
      listen(port + 1, triesLeft - 1)
    } else {
      throw e
    }
  })
  server.listen(port, () => {
    console.log(`검수 화면 → http://localhost:${port}`)
    const files = listFiles()
    if (!files.length) return console.log('파일: (korean-meaning-worklist*.tsv 없음)')
    console.log(`파일: ${defaultFile(files)} 로 엶` + (files.length > 1 ? `  (전체 ${files.length}개, 화면에서 전환)` : ''))
  })
}
listen(PORT, 9)

const HTML = /* html */ `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>뜻 검수</title>
<style>
  :root { color-scheme: light dark; --bg:#f7f5f1; --fg:#1a1714; --dim:#6b645c; --line:#ddd6cc; --card:#fff; --accent:#2f6f4f; --ng:#b23b2e; }
  @media (prefers-color-scheme: dark) { :root { --bg:#141210; --fg:#eee9e3; --dim:#9b938a; --line:#332e29; --card:#1d1a17; --accent:#5fae86; --ng:#e0705f; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.6 system-ui, "Apple SD Gothic Neo","Malgun Gothic",sans-serif; }
  .wrap { max-width:720px; margin:0 auto; padding:16px; }
  header { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-bottom:12px; }
  select, button { font:inherit; color:inherit; }
  select { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:4px 8px; }
  .bar { flex:1; height:8px; background:var(--line); border-radius:99px; overflow:hidden; min-width:120px; }
  .bar > div { height:100%; background:var(--accent); }
  .count { color:var(--dim); font-variant-numeric:tabular-nums; font-size:13px; }
  .tiers { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px; }
  .tiers button { border:1px solid var(--line); background:var(--card); border-radius:99px; padding:3px 10px; font-size:13px; cursor:pointer; }
  .tiers button.on { border-color:var(--accent); color:var(--accent); font-weight:600; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:20px; }
  .hw { font-size:40px; font-weight:700; margin:0; letter-spacing:-.02em; }
  .rd { color:var(--dim); font-size:18px; margin:2px 0 14px; }
  .lbl { font-size:12px; letter-spacing:.08em; color:var(--dim); text-transform:uppercase; margin:14px 0 4px; }
  .en { color:var(--dim); }
  textarea { width:100%; min-height:72px; font:17px/1.5 inherit; padding:10px 12px; border:1px solid var(--line); border-radius:10px; background:var(--bg); color:var(--fg); resize:vertical; }
  textarea.edited { border-color:var(--accent); }
  .ref { color:var(--dim); font-size:14px; white-space:pre-wrap; }
  .meta { display:flex; gap:12px; flex-wrap:wrap; color:var(--dim); font-size:13px; margin-top:10px; }
  .tag { border:1px solid var(--line); border-radius:99px; padding:1px 8px; }
  .tag.flag { border-color:var(--ng); color:var(--ng); }
  .cats { display:flex; gap:6px; align-items:center; margin-top:8px; }
  .cats button { border:1px solid var(--line); background:var(--card); border-radius:8px; padding:3px 10px; cursor:pointer; font-size:13px; }
  .cats button.on { border-color:var(--accent); color:var(--accent); font-weight:600; }
  .acts { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:18px; }
  .acts button { padding:12px 0; border-radius:10px; border:1px solid var(--line); background:var(--card); cursor:pointer; font-size:15px; }
  .acts button.ok { border-color:var(--accent); color:var(--accent); font-weight:700; }
  .acts .k { display:block; font-size:11px; color:var(--dim); margin-top:2px; }
  .nav { display:flex; justify-content:space-between; margin-top:12px; }
  .nav button { background:none; border:0; color:var(--dim); cursor:pointer; font-size:13px; padding:6px; }
  .done { text-align:center; padding:40px; color:var(--dim); }
  .hint { color:var(--dim); font-size:12px; text-align:center; margin-top:10px; }
</style></head><body><div class="wrap">
<header>
  <select id="file"></select>
  <select id="scope"><option value="unreviewed">미검수만</option><option value="all">전체</option></select>
  <div class="bar"><div id="prog"></div></div>
  <span class="count" id="cnt"></span>
</header>
<div class="tiers" id="tiers"></div>
<div id="view"></div>
<div class="hint">단축키 &nbsp; O 맞음 &nbsp; E 고쳐서맞음 &nbsp; K 애매 &nbsp; S 국어사전 &nbsp; X 틀림(보류) &nbsp; ← → 이동</div>
</div>
<script>
const $ = (s)=>document.querySelector(s)
let S = { file:null, header:[], rows:[], col:{}, tier:'', scope:'unreviewed', i:0 }
const DONE = /^[oxs~]$/

async function load(file){
  const r = await fetch('/api/state'+(file?'?file='+encodeURIComponent(file):''))
  const d = await r.json()
  S.file = d.file; S.header = d.header; S.rows = d.rows
  S.col = Object.fromEntries(d.header.map((h,i)=>[h,i]))
  $('#file').innerHTML = d.files.map(f=>'<option'+(f===d.file?' selected':'')+'>'+f+'</option>').join('')
  buildTiers(); S.i = 0; render()
}
function tiersList(){ return [...new Set(S.rows.map(r=>r[S.col.tier]))].sort() }
function buildTiers(){
  const ts = tiersList()
  $('#tiers').innerHTML = ['<button data-t="" class="'+(S.tier===''?'on':'')+'">전체</button>']
    .concat(ts.map(t=>'<button data-t="'+t+'" class="'+(S.tier===t?'on':'')+'">T'+t+'</button>')).join('')
  $('#tiers').querySelectorAll('button').forEach(b=>b.onclick=()=>{ S.tier=b.dataset.t; S.i=0; buildTiers(); render() })
}
function pool(){
  return S.rows.filter(r=>{
    if(S.tier!=='' && r[S.col.tier]!==S.tier) return false
    if(S.scope==='unreviewed' && DONE.test((r[S.col.verdict]||'').trim())) return false
    return true
  })
}
function render(){
  const p = pool(); const done = S.rows.filter(r=>DONE.test((r[S.col.verdict]||'').trim())).length
  $('#prog').style.width = (S.rows.length? done/S.rows.length*100:0)+'%'
  $('#cnt').textContent = done+' / '+S.rows.length+' 검수'
  if(!p.length){ $('#view').innerHTML = '<div class="done">이 조건에 남은 행이 없어요. 필터를 바꾸거나 다른 파일을 고르세요.</div>'; return }
  if(S.i>=p.length) S.i = p.length-1
  if(S.i<0) S.i = 0
  const c = S.col, row = p[S.i]
  const g = (k)=> row[c[k]] ?? ''
  const flags = g('flags').split(',').filter(Boolean)
  $('#view').innerHTML = \`
    <div class="card">
      <p class="hw" lang="ja">\${esc(g('headword'))}</p>
      <p class="rd" lang="ja">\${esc(g('reading'))}</p>
      <div class="lbl">영어 뜻 (원본)</div><div class="en">\${esc(g('glossEn'))}</div>
      <div class="lbl">한국어 뜻 — 필요하면 고치세요</div>
      <textarea id="ko">\${esc(g('llm_ko'))}</textarea>
      \${g('stdict_def') ? '<div class="lbl">참고 · 국어사전</div><div class="ref">'+esc(g('stdict_def'))+'</div>' : ''}
      \${g('manual_reason') ? '<div class="lbl">이전 검수 메모</div><div class="ref">'+esc(g('manual_reason'))+'</div>' : ''}
      <div class="meta">
        <span class="tag">밴드 \${esc(g('band'))}</span>
        <span class="tag">분류 \${esc(g('category'))} · \${esc(g('classSource'))}</span>
        <span class="tag">T\${esc(g('tier'))}</span>
        \${flags.map(f=>'<span class="tag flag">'+esc(f)+'</span>').join('')}
        \${g('verdict') && DONE.test(g('verdict')) ? '<span class="tag">현재: '+esc(g('verdict'))+'</span>' : ''}
      </div>
      <div class="cats">분류 교정:
        \${[1,2,3].map(n=>'<button data-c="'+n+'" class="'+(String(g('cat'))===String(n)?'on':'')+'">'+n+'</button>').join('')}
        <button data-c="" class="\${!g('cat')?'on':''}">비움</button>
      </div>
      <div class="acts">
        <button data-v="o" class="ok">맞음<span class="k">O</span></button>
        <button data-v="~">애매<span class="k">K</span></button>
        <button data-v="s">국어사전<span class="k">S</span></button>
        <button data-v="x">틀림·보류<span class="k">X</span></button>
      </div>
      <div class="nav"><button id="prev">← 이전</button><button id="next">건너뜀 →</button></div>
    </div>\`
  const ta = $('#ko'), orig = g('llm_ko')
  ta.oninput = ()=> ta.classList.toggle('edited', ta.value.trim()!==orig.trim())
  $('#view').querySelectorAll('.cats button').forEach(b=> b.onclick = ()=> saveRow(row, null, b.dataset.c))
  $('#view').querySelectorAll('.acts button').forEach(b=> b.onclick = ()=> saveRow(row, b.dataset.v))
  $('#prev').onclick = ()=>{ S.i=Math.max(0,S.i-1); render() }
  $('#next').onclick = ()=>{ S.i++; render() }
}
async function saveRow(row, verdict, cat){
  const c = S.col
  const ko = $('#ko') ? $('#ko').value : row[c.llm_ko]
  const body = { file:S.file, id:row[c.id] }
  if(verdict!=null) body.verdict = verdict
  if(cat!=null) body.cat = cat
  body.llm_ko = ko
  // 로컬 반영
  if(verdict!=null) row[c.verdict] = verdict
  if(cat!=null) row[c.cat] = cat
  row[c.llm_ko] = ko.replace(/[\\t\\r\\n]+/g,' ').trim()
  const r = await fetch('/api/save',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
  const d = await r.json()
  if(!d.ok){ alert('저장 실패: '+d.error); return }
  if(verdict!=null && S.scope==='unreviewed'){ render() }   // 미검수 목록에선 자동으로 다음
  else { S.i++; render() }
}
function esc(s){ return String(s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])) }
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='TEXTAREA' && e.key!=='Escape') return
  const p = pool(); if(!p.length) return
  const row = p[Math.min(S.i,p.length-1)]
  const k = e.key.toLowerCase()
  if(k==='o') saveRow(row,'o')
  else if(k==='e'){ $('#ko')&&$('#ko').focus() }
  else if(k==='k') saveRow(row,'~')
  else if(k==='s') saveRow(row,'s')
  else if(k==='x') saveRow(row,'x')
  else if(e.key==='ArrowRight'){ S.i++; render() }
  else if(e.key==='ArrowLeft'){ S.i=Math.max(0,S.i-1); render() }
})
$('#file').onchange = ()=> load($('#file').value)
$('#scope').onchange = ()=>{ S.scope=$('#scope').value; S.i=0; render() }
load()
</script></body></html>`
