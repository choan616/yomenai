// 사람 verdict(korean-review.tsv) + Ollama 초벌(korean-llm-draft.tsv)을 접어 숙어별 최종 분류를 굳히는 스크립트
// 1 동형동의(교정) · 2 동형이의(확장) · 3 관련없음→일본고유(확장)
// 우선순위: 사람 verdict > (--trust-llm 일 때) 초벌 > 잠정값
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'

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

const REVIEW_PATH = join(DICT_DIR, 'korean-review.tsv')
const MATCH_PATH = join(DICT_DIR, 'korean-match.json')
const DRAFT_PATH = join(DICT_DIR, 'korean-llm-draft.tsv')
const TRUST_LLM = process.argv.includes('--trust-llm')

if (!existsSync(REVIEW_PATH) || !existsSync(MATCH_PATH)) {
  console.error('korean-review.tsv / korean-match.json 이 없다. match:korean 을 먼저 실행한다.')
  process.exit(1)
}

const { byId } = JSON.parse(readFileSync(MATCH_PATH, 'utf8')) as { byId: Record<string, MatchEntry> }

// 사람 verdict
const reviewLines = readFileSync(REVIEW_PATH, 'utf8').split('\n')
const rh = reviewLines[0].split('\t')
const idCol = rh.indexOf('id')
const verdictCol = rh.indexOf('verdict')
if (idCol < 0 || verdictCol < 0) {
  console.error('korean-review.tsv 헤더에 id / verdict 열이 없다.')
  process.exit(1)
}
const verdicts = new Map<string, 1 | 2 | 3>()
let unfilled = 0
let bad = 0
for (const line of reviewLines.slice(1)) {
  if (!line.trim()) continue
  const c = line.split('\t')
  const id = c[idCol]?.trim()
  const raw = c[verdictCol]?.trim()
  if (!id) continue
  if (!raw) unfilled++
  else if (raw === '1' || raw === '2' || raw === '3') verdicts.set(id, Number(raw) as 1 | 2 | 3)
  else bad++
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
const classById: Record<
  string,
  {
    category: 1 | 2 | 3
    classSource: ClassSource
    koMeaning: { word: string; origin: string; definition: string; source: 'stdict'; verified: false } | null
  }
> = {}
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
  const top = e.matches.find((m) => m.originMatch) ?? e.matches[0] ?? null
  classById[id] = {
    category,
    classSource,
    koMeaning:
      category === 3 || !top
        ? null
        : { word: top.word, origin: top.origin, definition: top.definition, source: 'stdict', verified: false },
  }
}

writeFileSync(
  join(DICT_DIR, 'korean-class.json'),
  JSON.stringify({
    _meta: {
      source: 'stdict 대조 + 사람 검수(korean-review.tsv) + Ollama 초벌(korean-llm-draft.tsv)',
      categories: { '1': '동형동의(교정)', '2': '동형이의(확장)', '3': '일본 고유(확장)' },
      trustLlm: TRUST_LLM,
      note: 'koMeaning.verified 는 항상 false. classSource=llm/default 는 미확정',
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
console.log(`  → ${join(DICT_DIR, 'korean-class.json')}`)
if (unfilled > 0 && !TRUST_LLM) console.log(`  ⚠ 미검수 ${unfilled}건은 잠정 2번. verdict 채우거나 --trust-llm 사용.`)
