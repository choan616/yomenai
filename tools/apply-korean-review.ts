// 사람 verdict(korean-review.tsv) + Ollama 초벌(korean-llm-draft.tsv)을 접어 숙어별 최종 분류를 굳히는 스크립트
// 1 동형동의(교정) · 2 동형이의(확장) · 3 관련없음→일본고유(확장)
// 우선순위: 사람 verdict > (--trust-llm 일 때) 초벌 > 잠정값
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { normalizeDefinition } from './lib/meaning.ts'

interface MatchRow {
  word: string
  supNo: string
  origin: string
  pos: string
  definition: string
  link: string
  originMatch: boolean
}
interface MatchEntry {
  category: 'JP_UNIQUE' | 'NEEDS_REVIEW'
  tentativeCategory: 1 | 2 | 3
  band: number
  candidates: string[]
  hasOriginMatch: boolean
  matches: MatchRow[]
}

// 작업 파일(korean-worklist*.tsv)이 있으면 그쪽 verdict 를 사람 검수로 읽는다. 없으면 korean-review.tsv
const worklists = readdirSync(DICT_DIR).filter((f) => /^korean-worklist.*\.tsv$/.test(f))
const REVIEW_PATHS =
  worklists.length > 0 ? worklists.map((f) => join(DICT_DIR, f)) : [join(DICT_DIR, 'korean-review.tsv')]
const MATCH_PATH = join(DICT_DIR, 'korean-match.json')
const DRAFT_PATH = join(DICT_DIR, 'korean-llm-draft.tsv')
const MEANING_PATH = join(DICT_DIR, 'korean-meaning.json')
const TRUST_LLM = process.argv.includes('--trust-llm')

// koMeaning 원본 — 있으면 JMdict 영어 gloss 번역(build:korean-meaning)을 쓴다. 없으면 stdict 정의로 폴백
const meaningById: Record<string, { ko: string; glossEn: string[] }> = existsSync(MEANING_PATH)
  ? (JSON.parse(readFileSync(MEANING_PATH, 'utf8')).byId as Record<string, { ko: string; glossEn: string[] }>)
  : {}

if (!existsSync(MATCH_PATH) || !REVIEW_PATHS.every(existsSync)) {
  console.error('korean-review.tsv / korean-match.json 이 없다. match:korean 을 먼저 실행한다.')
  process.exit(1)
}

const { byId } = JSON.parse(readFileSync(MATCH_PATH, 'utf8')) as { byId: Record<string, MatchEntry> }

// 사람 verdict — 여러 작업 파일을 합친다 (tier 별로 분리돼 있을 수 있음)
const verdicts = new Map<string, 1 | 2 | 3>()
let unfilled = 0
let bad = 0
for (const path of REVIEW_PATHS) {
  const lines = readFileSync(path, 'utf8').split('\n')
  const h = lines[0].split('\t')
  const idCol = h.indexOf('id')
  const verdictCol = h.indexOf('verdict')
  if (idCol < 0 || verdictCol < 0) {
    console.error(`${path} 헤더에 id / verdict 열이 없다.`)
    process.exit(1)
  }
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const c = line.split('\t')
    const id = c[idCol]?.trim()
    const raw = c[verdictCol]?.trim()
    if (!id) continue
    if (!raw || raw === '?') unfilled++
    else if (raw === '1' || raw === '2' || raw === '3') verdicts.set(id, Number(raw) as 1 | 2 | 3)
    else bad++
  }
}

// Ollama 초벌 (id -> verdict). 여러 모델이 있으면 마지막 줄이 이긴다
const llmDraft = new Map<string, 1 | 2 | 3>()
if (existsSync(DRAFT_PATH)) {
  const dl = readFileSync(DRAFT_PATH, 'utf8').split('\n')
  const dh = dl[0].split('\t')
  const di = dh.indexOf('id')
  const dv = dh.indexOf('verdict')
  for (const line of dl.slice(1)) {
    if (!line.trim()) continue
    const c = line.split('\t')
    const raw = c[dv]?.trim()
    if (c[di] && (raw === '1' || raw === '2' || raw === '3')) llmDraft.set(c[di], Number(raw) as 1 | 2 | 3)
  }
}

type ClassSource = 'manual' | 'llm' | 'default'
const dist = { 1: 0, 2: 0, 3: 0 }
const bySource = { manual: 0, llm: 0, default: 0 }
type KoMeaning = {
  definition: string
  glossEn?: string[]
  source: 'stdict' | 'llm' | 'manual'
  verified: false
}
const classById: Record<
  string,
  { category: 1 | 2 | 3; classSource: ClassSource; koMeaning: KoMeaning | null }
> = {}
let meaningLlm = 0
let meaningStdict = 0
for (const [id, e] of Object.entries(byId)) {
  let category: 1 | 2 | 3
  let classSource: ClassSource
  if (verdicts.has(id)) {
    category = verdicts.get(id)!
    classSource = 'manual'
  } else if (TRUST_LLM && llmDraft.has(id)) {
    category = llmDraft.get(id)!
    classSource = 'llm'
  } else {
    category = e.category === 'JP_UNIQUE' ? 3 : 2
    classSource = 'default'
  }
  dist[category]++
  bySource[classSource]++

  // koMeaning — 영어 gloss 번역 우선(카테고리 3 포함), 없으면 stdict 정의, 그것도 없으면 null
  const llm = meaningById[id]
  const top = e.matches.find((m) => m.originMatch) ?? e.matches[0] ?? null
  let koMeaning: KoMeaning | null = null
  if (llm && llm.ko) {
    koMeaning = { definition: normalizeDefinition(llm.ko), glossEn: llm.glossEn, source: 'llm', verified: false }
    meaningLlm++
  } else if (category !== 3 && top) {
    koMeaning = { definition: normalizeDefinition(top.definition), source: 'stdict', verified: false }
    meaningStdict++
  }
  classById[id] = { category, classSource, koMeaning }
}

writeFileSync(
  join(DICT_DIR, 'korean-class.json'),
  JSON.stringify({
    _meta: {
      source: '분류: stdict 대조 + 사람 검수 + Ollama 초벌 / koMeaning: JMdict 영어 gloss 번역(build:korean-meaning) 우선, stdict 폴백',
      categories: { '1': '동형동의(교정)', '2': '동형이의(확장)', '3': '일본 고유(확장)' },
      trustLlm: TRUST_LLM,
      note: 'koMeaning.verified 는 항상 false (apply:korean-meaning 이 검수분만 true 로). classSource=llm/default 는 미확정',
      generatedAt: new Date().toISOString(),
    },
    stats: {
      total: Object.keys(classById).length,
      bySource,
      badVerdict: bad,
      byCategory: dist,
    },
    byId: classById,
  }),
)

console.log('=== 한국어 대조 검수 반영 ===')
console.log(
  `  사람 ${bySource.manual}건 / 초벌 ${bySource.llm}건${TRUST_LLM ? '' : '(미반영, --trust-llm 필요)'} / 잠정 ${bySource.default}건${bad ? ` / 잘못된 verdict ${bad}건` : ''}`,
)
console.log(`  최종 분류 — 동형동의 ${dist[1]} / 동형이의 ${dist[2]} / 일본고유 ${dist[3]}`)
console.log(`  koMeaning — 영어 gloss 번역 ${meaningLlm} / stdict 폴백 ${meaningStdict} / 없음 ${Object.keys(classById).length - meaningLlm - meaningStdict}`)
console.log(`  → ${join(DICT_DIR, 'korean-class.json')}`)
if (unfilled > 0 && !TRUST_LLM) console.log(`  ⚠ 미검수 ${unfilled}건은 잠정 2번. verdict 채우거나 --trust-llm 사용.`)
