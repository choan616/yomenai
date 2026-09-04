// 로컬 Ollama로 korean-review.tsv 검수 큐에 1/2/3 초벌을 매긴다. 빌드타임 전용, 결과는 korean-llm-draft.tsv
// 모드: 기본(초벌 생성) / --sample=N(사람 라벨링용 표본 추출) / --validate(사람 verdict 대비 정확도 측정)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { judge, type JudgeInput } from './lib/ollama.ts'

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const has = (k: string) => process.argv.includes(`--${k}`)

const MODEL = arg('model') ?? 'qwen3.5:latest'
const LIMIT = Number(arg('limit')) || Infinity
const SCOPE = arg('scope') ?? 'band01+sound' // all | band01 | sound | band01+sound
const IN_PATH = arg('in') ?? join(DICT_DIR, 'korean-review.tsv')
const SAMPLE_N = Number(arg('sample')) || 0
const SEED = Number(arg('seed')) || 20260904
const CACHE_PATH = join(DICT_DIR, '.korean-llm-cache.json')
const DRAFT_PATH = join(DICT_DIR, 'korean-llm-draft.tsv')

interface Row {
  verdict: string
  originMatch: string
  band: string
  headword: string
  reading: string
  glossEn: string
  koWord: string
  koOrigin: string
  koDef: string
  id: string
}

function readRows(path: string): Row[] {
  const lines = readFileSync(path, 'utf8').split('\n')
  const h = lines[0].split('\t')
  const col = (name: string) => h.indexOf(name)
  const ci = {
    verdict: col('verdict'),
    originMatch: col('originMatch'),
    band: col('band'),
    headword: col('headword'),
    reading: col('reading'),
    glossEn: col('glossEn'),
    koWord: col('ko_word'),
    koOrigin: col('ko_origin'),
    koDef: col('ko_definition'),
    id: col('id'),
  }
  const rows: Row[] = []
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split('\t')
    rows.push({
      verdict: (c[ci.verdict] ?? '').trim(),
      originMatch: c[ci.originMatch] ?? '',
      band: c[ci.band] ?? '',
      headword: c[ci.headword] ?? '',
      reading: c[ci.reading] ?? '',
      glossEn: c[ci.glossEn] ?? '',
      koWord: c[ci.koWord] ?? '',
      koOrigin: c[ci.koOrigin] ?? '',
      koDef: c[ci.koDef] ?? '',
      id: (c[ci.id] ?? '').trim(),
    })
  }
  return rows
}

// 결정적 셔플 (mulberry32)
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function inScope(r: Row): boolean {
  const b01 = r.band === '0' || r.band === '1'
  const sound = r.originMatch === 'n'
  if (SCOPE === 'all') return true
  if (SCOPE === 'band01') return b01
  if (SCOPE === 'sound') return sound
  return b01 || sound // band01+sound
}

const toInput = (r: Row): JudgeInput => ({
  headword: r.headword,
  reading: r.reading,
  glossEn: r.glossEn,
  koWord: r.koWord,
  koOrigin: r.koOrigin,
  koDef: r.koDef,
  originMatch: r.originMatch === 'Y',
})

// ── 표본 추출 모드 ──────────────────────────────────────────────────────────
if (SAMPLE_N > 0) {
  const rows = readRows(IN_PATH)
  const rnd = seeded(SEED)
  // originMatch(Y/n) × band 로 층화
  const strata = new Map<string, Row[]>()
  for (const r of rows) {
    const k = `${r.originMatch}:${r.band}`
    ;(strata.get(k) ?? strata.set(k, []).get(k)!).push(r)
  }
  const picked: Row[] = []
  const perStratum = Math.ceil(SAMPLE_N / strata.size)
  for (const list of strata.values()) {
    const shuffled = [...list].sort(() => rnd() - 0.5)
    picked.push(...shuffled.slice(0, perStratum))
  }
  const out = picked.sort(() => rnd() - 0.5).slice(0, SAMPLE_N)
  const path = join(DICT_DIR, 'korean-review-sample.tsv')
  writeFileSync(
    path,
    'verdict\toriginMatch\tband\theadword\treading\tglossEn\tko_word\tko_origin\tko_definition\tid\n' +
      out
        .map((r) =>
          ['?', r.originMatch, r.band, r.headword, r.reading, r.glossEn, r.koWord, r.koOrigin, r.koDef, r.id].join(
            '\t',
          ),
        )
        .join('\n') +
      '\n',
  )
  console.log(`표본 ${out.length}건 → ${path}`)
  console.log('verdict 칸에 1/2/3 을 채운 뒤: npm run draft:korean-review -- --validate --in=' + path)
  process.exit(0)
}

// ── 초벌 / 검증 공통: Ollama 판정 ──────────────────────────────────────────
type Cache = Record<string, { verdict: 1 | 2 | 3; reason: string }>
const cache: Cache =
  existsSync(CACHE_PATH) && !has('validate')
    ? (JSON.parse(readFileSync(CACHE_PATH, 'utf8')) as Cache)
    : {}

async function run() {
  const all = readRows(IN_PATH)
  const validate = has('validate')
  const targets = (validate ? all.filter((r) => /^[123]$/.test(r.verdict)) : all.filter((r) => !r.verdict))
    .filter(inScope)
    .slice(0, LIMIT)

  if (targets.length === 0) {
    console.error(validate ? 'verdict 가 채워진 행이 없다. 표본을 먼저 라벨링한다.' : '초벌 대상 행이 없다.')
    process.exit(1)
  }
  console.log(`모델 ${MODEL} · ${validate ? '검증' : '초벌'} · 대상 ${targets.length}건 (scope=${SCOPE})`)

  const results: { row: Row; verdict: 1 | 2 | 3; reason: string }[] = []
  const t0 = Date.now()
  let done = 0
  let flushed = 0
  for (const row of targets) {
    const key = `${row.id}\t${MODEL}`
    let hit = validate ? undefined : cache[key]
    if (!hit) {
      hit = await judge(MODEL, toInput(row))
      if (!validate) {
        cache[key] = hit
        if (++flushed % 50 === 0) writeFileSync(CACHE_PATH, JSON.stringify(cache))
      }
    }
    results.push({ row, verdict: hit.verdict, reason: hit.reason })
    if (++done % 100 === 0) {
      const rate = done / ((Date.now() - t0) / 1000)
      console.log(`  ${done}/${targets.length}  (${rate.toFixed(2)}/s)`)
    }
  }
  if (!validate) writeFileSync(CACHE_PATH, JSON.stringify(cache))

  const perRow = (Date.now() - t0) / done / 1000

  if (validate) {
    const conf: Record<string, number> = {}
    let agree = 0
    const misses: string[] = []
    for (const { row, verdict, reason } of results) {
      const human = Number(row.verdict) as 1 | 2 | 3
      conf[`${human}->${verdict}`] = (conf[`${human}->${verdict}`] ?? 0) + 1
      if (human === verdict) agree++
      else misses.push(`  ${row.headword}\t사람 ${human} / LLM ${verdict}\t${reason}`)
    }
    console.log(`\n=== 검증 (${MODEL}, ${results.length}건) ===`)
    console.log(`  일치율 ${((agree / results.length) * 100).toFixed(1)}%  (${agree}/${results.length})`)
    console.log(`  건당 ${perRow.toFixed(2)}s → 전체 스코프 추정은 draft 실행 시 산정`)
    console.log('  혼동 (사람->LLM):')
    for (const [k, n] of Object.entries(conf).sort()) console.log(`    ${k}: ${n}`)
    console.log('  불일치:')
    console.log(misses.join('\n'))
    return
  }

  // 초벌 결과를 캐시 전체에서 재구성해 tsv 로 쓴다 (모델별 누적)
  const lines = ['id\tmodel\tverdict\treason']
  for (const [k, v] of Object.entries(cache)) {
    const [id, model] = k.split('\t')
    lines.push(`${id}\t${model}\t${v.verdict}\t${v.reason}`)
  }
  writeFileSync(DRAFT_PATH, lines.join('\n') + '\n')

  const dist = { 1: 0, 2: 0, 3: 0 }
  for (const r of results) dist[r.verdict]++
  console.log(`\n=== 초벌 완료 (${MODEL}, ${results.length}건, 건당 ${perRow.toFixed(2)}s) ===`)
  console.log(`  verdict 분포 — 1(동형동의) ${dist[1]} / 2(동형이의) ${dist[2]} / 3(무관) ${dist[3]}`)
  console.log(`  → ${DRAFT_PATH}  (누적 ${Object.keys(cache).length}건)`)
  console.log('  다음: 사람이 korean-review.tsv verdict 를 채우거나, apply:korean-review --trust-llm 로 초벌 반영')
}

run()
