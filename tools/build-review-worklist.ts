// korean-review.tsv + korean-llm-draft.tsv 를 합쳐 우선순위 순으로 정렬한 수동 검수 작업 파일을 만든다
// 사람은 korean-worklist.tsv 의 verdict 칸만 채운다. apply-korean-review 가 이 파일을 우선해서 읽는다
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'

const REVIEW = join(DICT_DIR, 'korean-review.tsv')
const DRAFT = join(DICT_DIR, 'korean-llm-draft.tsv')
const OUT = join(DICT_DIR, 'korean-worklist.tsv')

if (!existsSync(REVIEW)) {
  console.error('korean-review.tsv 가 없다. match:korean 을 먼저 실행한다.')
  process.exit(1)
}

interface Rev {
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

const rl = readFileSync(REVIEW, 'utf8').split('\n')
const rh = rl[0].split('\t')
const ri = Object.fromEntries(
  ['originMatch', 'band', 'headword', 'reading', 'glossEn', 'ko_word', 'ko_origin', 'ko_definition', 'id'].map(
    (k) => [k, rh.indexOf(k)],
  ),
)
const rows: Rev[] = rl
  .slice(1)
  .filter((l) => l.trim())
  .map((l) => {
    const c = l.split('\t')
    return {
      originMatch: c[ri.originMatch],
      band: c[ri.band],
      headword: c[ri.headword],
      reading: c[ri.reading],
      glossEn: c[ri.glossEn],
      koWord: c[ri.ko_word],
      koOrigin: c[ri.ko_origin],
      koDef: c[ri.ko_definition],
      id: c[ri.id],
    }
  })

// 이전 작업 파일에서 채운 verdict 이어받기
const prior = new Map<string, string>()
if (existsSync(OUT)) {
  const ol = readFileSync(OUT, 'utf8').split('\n')
  const oh = ol[0].split('\t')
  const ov = oh.indexOf('verdict')
  const oi = oh.indexOf('id')
  for (const l of ol.slice(1)) {
    const c = l.split('\t')
    if (c[oi] && /^[123]$/.test((c[ov] ?? '').trim())) prior.set(c[oi], c[ov].trim())
  }
}

// Ollama 초벌 (id -> {verdict, reason})
const draft = new Map<string, { v: string; r: string }>()
if (existsSync(DRAFT)) {
  const dl = readFileSync(DRAFT, 'utf8').split('\n')
  const dh = dl[0].split('\t')
  const [di, dv, dr] = [dh.indexOf('id'), dh.indexOf('verdict'), dh.indexOf('reason')]
  for (const l of dl.slice(1)) {
    const c = l.split('\t')
    if (c[di]) draft.set(c[di], { v: c[dv] ?? '', r: c[dr] ?? '' })
  }
}

/**
 * 검수 우선순위 tier.
 * 1  n블록·초벌 1/2 — originMatch 오탐 복구 확인 (減税/減稅 류). 작고 빠름
 * 2  밴드0 Y블록·초벌 2 — 교정↔확장 갈림, 가장 흔한 밴드. 신중히
 * 3  n블록·초벌 3 — KO 간섭 핵심. 잘못된 3(실은 같은 단어) 없는지 훑기
 * 4  밴드0 Y블록·초벌 1 — 잘못된 1은 틀린 뜻으로 교정 모드 진입. 훑기
 * 5  밴드1 Y·초벌 2 / 6  밴드1 Y·초벌 1 / 7  n블록 초벌 없음
 * 9  밴드2~3 Y블록 — 초벌 없음. 지연 검수(Phase 4). 맨 뒤
 */
function tierOf(r: Rev): number {
  const d = draft.get(r.id)
  const b0 = r.band === '0'
  const b1 = r.band === '1'
  if (r.originMatch === 'n') {
    if (!d) return 7
    if (d.v === '3') return 3
    return 1 // 1 or 2
  }
  // Y
  if (b0) return d?.v === '2' ? 2 : d ? 4 : 9
  if (b1) return d?.v === '2' ? 5 : d ? 6 : 9
  return 9 // band 2~3
}

const enriched = rows
  .map((r) => ({ r, tier: tierOf(r), d: draft.get(r.id) }))
  .sort(
    (a, b) =>
      a.tier - b.tier ||
      Number(a.r.band) - Number(b.r.band) ||
      a.r.headword.localeCompare(b.r.headword),
  )

const header = [
  'verdict',
  'tier',
  'llm',
  'originMatch',
  'band',
  'headword',
  'reading',
  'glossEn',
  'ko_word',
  'ko_origin',
  'ko_definition',
  'llm_reason',
  'id',
].join('\t')

const body = enriched.map(({ r, tier, d }) =>
  [
    prior.get(r.id) ?? '',
    tier,
    d?.v ?? '',
    r.originMatch,
    r.band,
    r.headword,
    r.reading,
    r.glossEn,
    r.koWord,
    r.koOrigin,
    r.koDef,
    (d?.r ?? '').replace(/\s+/g, ' '),
    r.id,
  ].join('\t'),
)

writeFileSync(OUT, header + '\n' + body.join('\n') + '\n')

const tierCount: Record<number, number> = {}
for (const e of enriched) tierCount[e.tier] = (tierCount[e.tier] ?? 0) + 1
console.log(`→ ${OUT}  (${enriched.length}행, 이어받은 verdict ${prior.size}건)`)
console.log('tier별 행 수 (낮을수록 우선):')
const labels: Record<number, string> = {
  1: 'n·초벌1/2  원어 오탐 복구 확인',
  2: '밴드0 Y·초벌2  교정↔확장 갈림 (신중히)',
  3: 'n·초벌3  KO 간섭, 잘못된 3 없는지',
  4: '밴드0 Y·초벌1  잘못된 1 없는지',
  5: '밴드1 Y·초벌2',
  6: '밴드1 Y·초벌1',
  7: 'n·초벌 없음',
  9: '밴드2~3 Y  지연 검수(Phase 4)',
}
for (const t of Object.keys(tierCount).map(Number).sort((a, b) => a - b)) {
  console.log(`  tier ${t}  ${String(tierCount[t]).padStart(5)}  ${labels[t]}`)
}
