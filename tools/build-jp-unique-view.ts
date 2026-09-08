// 일본 고유(category 3) 숙어를 브라우저로 훑어보는 단일 HTML 을 만든다 — 검수 안 해도 확인용.
//   npm run view:jp-unique   →   data/dict/jp-unique.html
// korean-class.json(분류·뜻) + idioms.json(표기·읽기·빈도) 를 조인한다. base.json 재빌드 없이 최신 apply 반영.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { priorityToBand } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'

interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: { definition: string; glossEn?: string[]; source: string; verified: boolean } | null
}

const OUT_PATH = join(DICT_DIR, 'jp-unique.html')
const need = (p: string) => {
  if (!existsSync(p)) {
    console.error(`${p} 가 없다.`)
    process.exit(1)
  }
  return p
}

const { byId } = JSON.parse(readFileSync(need(join(DICT_DIR, 'korean-class.json')), 'utf8')) as {
  byId: Record<string, KoClass>
}
const { idioms } = JSON.parse(readFileSync(need(join(DICT_DIR, 'idioms.json')), 'utf8')) as { idioms: IdiomRecord[] }
const idiomById = new Map(idioms.map((i) => [i.id, i]))

const rows = Object.entries(byId)
  .filter(([, k]) => k.category === 3 && k.koMeaning)
  .map(([id, k]) => {
    const it = idiomById.get(id)
    return {
      id,
      hw: it?.headword ?? id,
      yomi: it?.reading ?? '',
      band: it ? priorityToBand(it.priority) : 4,
      en: (k.koMeaning?.glossEn ?? []).join('; '),
      ko: k.koMeaning?.definition ?? '',
      src: k.koMeaning?.source ?? '',
      ver: k.koMeaning?.verified === true,
    }
  })
  .sort((a, b) => a.band - b.band || a.yomi.localeCompare(b.yomi, 'ja'))

const byBand: Record<number, number> = {}
for (const r of rows) byBand[r.band] = (byBand[r.band] ?? 0) + 1
const verCount = rows.filter((r) => r.ver).length

const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

const trs = rows
  .map(
    (r) => `<tr data-band="${r.band}" data-ver="${r.ver ? 1 : 0}">
<td class="ja hw" lang="ja">${esc(r.hw)}</td>
<td class="ja" lang="ja">${esc(r.yomi)}</td>
<td class="c">${r.band}</td>
<td class="en">${esc(r.en)}</td>
<td class="ko">${esc(r.ko)}</td>
<td class="c src ${esc(r.src)}">${r.ver ? '✓ ' : ''}${esc(r.src)}</td>
</tr>`,
  )
  .join('\n')

const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>일본 고유 숙어 (category 3) — ${rows.length}건</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 "Pretendard", "Noto Sans KR", system-ui, sans-serif; background: #fafafa; color: #1a1a1a; }
  .ja { font-family: "Noto Sans JP", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif; }
  header { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #ddd; padding: 12px 16px; z-index: 2; }
  h1 { font-size: 16px; margin: 0 0 8px; }
  .meta { font-size: 13px; color: #666; margin-bottom: 8px; }
  .controls { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  button { font: inherit; padding: 4px 10px; border: 1px solid #ccc; border-radius: 6px; background: #f2f2f2; cursor: pointer; }
  button.on { background: #1a1a1a; color: #fff; border-color: #1a1a1a; }
  input[type=search] { font: inherit; padding: 5px 10px; border: 1px solid #ccc; border-radius: 6px; min-width: 180px; flex: 1; }
  label.ck { font-size: 13px; color: #444; display: inline-flex; align-items: center; gap: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: 6px 12px; border-bottom: 1px solid #eee; vertical-align: top; }
  th { position: sticky; top: 96px; background: #fafafa; font-size: 12px; color: #888; font-weight: 600; z-index: 1; }
  td.c { text-align: center; }
  td.hw { font-size: 19px; font-weight: 700; }
  td.en { color: #777; font-size: 13px; max-width: 260px; }
  td.ko { max-width: 360px; }
  td.src { font-size: 12px; color: #999; }
  td.src.manual { color: #0a7; font-weight: 600; }
  td.src.stdict { color: #a70; }
  tr:hover td { background: rgba(0,0,0,.03); }
  #count { font-size: 13px; color: #666; margin-left: auto; }
  @media (prefers-color-scheme: dark) {
    body { background: #161616; color: #e8e8e8; }
    header, th { background: #1f1f1f; border-color: #333; }
    th { color: #999; }
    button { background: #2a2a2a; border-color: #444; color: #ddd; }
    button.on { background: #e8e8e8; color: #161616; border-color: #e8e8e8; }
    input[type=search] { background: #2a2a2a; border-color: #444; color: #ddd; }
    td, th { border-color: #2a2a2a; }
    td.en { color: #888; }
    tr:hover td { background: rgba(255,255,255,.04); }
  }
</style>
</head>
<body>
<header>
  <h1>일본 고유 숙어 <span lang="ja">(category 3)</span> — 총 ${rows.length}건</h1>
  <div class="meta">밴드 0: ${byBand[0] ?? 0} · 1: ${byBand[1] ?? 0} · 2: ${byBand[2] ?? 0} · 3: ${byBand[3] ?? 0}
    &nbsp;|&nbsp; 검수 완료 ${verCount}건 · 나머지는 LLM 초벌 (미검수)</div>
  <div class="controls">
    <button data-b="all" class="on">전체</button>
    <button data-b="0">밴드 0</button>
    <button data-b="1">밴드 1</button>
    <button data-b="2">밴드 2</button>
    <button data-b="3">밴드 3</button>
    <label class="ck"><input type="checkbox" id="unver"> 미검수만</label>
    <input type="search" id="q" placeholder="표기·읽기·뜻 검색">
    <span id="count"></span>
  </div>
</header>
<table>
<thead><tr><th>표기</th><th>읽기</th><th>밴드</th><th>英 gloss</th><th>한국어 뜻 (초벌)</th><th>출처</th></tr></thead>
<tbody id="tb">
${trs}
</tbody>
</table>
<script>
  const tb = document.getElementById("tb");
  const all = [...tb.rows];
  let band = "all", unver = false, q = "";
  function apply() {
    let n = 0;
    for (const tr of all) {
      const okB = band === "all" || tr.dataset.band === band;
      const okV = !unver || tr.dataset.ver === "0";
      const okQ = !q || tr.textContent.toLowerCase().includes(q);
      const show = okB && okV && okQ;
      tr.hidden = !show;
      if (show) n++;
    }
    document.getElementById("count").textContent = n + "건 표시";
  }
  for (const btn of document.querySelectorAll("button[data-b]")) {
    btn.onclick = () => {
      document.querySelectorAll("button[data-b]").forEach((b) => b.classList.toggle("on", b === btn));
      band = btn.dataset.b; apply();
    };
  }
  document.getElementById("unver").onchange = (e) => { unver = e.target.checked; apply(); };
  document.getElementById("q").oninput = (e) => { q = e.target.value.trim().toLowerCase(); apply(); };
  apply();
</script>
</body>
</html>
`

writeFileSync(OUT_PATH, html)
console.log(`→ ${OUT_PATH}  (${rows.length}행, ${(html.length / 1024).toFixed(0)} KB)`)
console.log(`  밴드 0/1/2/3: ${byBand[0] ?? 0}/${byBand[1] ?? 0}/${byBand[2] ?? 0}/${byBand[3] ?? 0} · 검수 완료 ${verCount}`)
