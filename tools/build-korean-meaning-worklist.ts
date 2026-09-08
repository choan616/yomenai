// 화면에 뜨는 한국어 뜻(koMeaning)이 맞는지 한일 이중언어 화자가 확인할 작업 파일 (checklist 12-D).
//
// 방향 변경(2026-09-07): koMeaning 은 이제 stdict 정의가 아니라 JMdict 영어 gloss 를 옮긴 것
// (build:korean-meaning, gemma4). 검수 질문이 "국어사전과 뜻이 갈리나"에서 "이 한 줄이 영어
// 뜻을 맞게·자연스럽게 옮겼나"로 바뀐다. 대신 gemma4 환각 때문에 한 번씩은 봐야 한다.
//
// 한 줄에 glossEn(원본) · llm_ko(검증 대상) · stdict_def(참고) · Phase 3 수동 분류 verdict/근거
// 를 나란히 놓는다. 수동 검수분(355 + 표본 200)과 품질 플래그가 붙은 행을 맨 앞으로.
//
// 사람은 verdict (+ 필요시 cat·fix) 만 채운다 —
//   o  맞다              → apply 가 verified:true
//   x  틀리다            → fix 칸에 고친 한국어 정의. verified:true, source:manual
//   ~  애매/어색          → verified 는 false 유지, fix 에 메모
//   s  stdict_def 채택     → 그 정의로 교체, verified:true, source:stdict (수동 분류 노동 보존)
//   ?  미기입
// cat  분류(1 동형동의 / 2 동형이의 / 3 일본고유)가 틀렸으면 고친 값. 비우면 그대로.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { priorityToBand } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: { definition: string; source: string; verified: boolean } | null
}
interface MeaningEntry {
  ko: string
  glossEn: string[]
  flags: string[]
}

const sampleArg = process.argv.find((a) => a.startsWith('--sample='))?.split('=')[1]
const wantAll = process.argv.includes('--all')
// --flagged: 표본 없이 품질 플래그(깨진 번역·cat 불일치 등)가 붙은 행 전량만. 최우선 검수 목록
const flaggedOnly = process.argv.includes('--flagged')
// --batch [--category=1|2|3] [--batch=N]: 아직 검수 안 한 다음 N건만 뽑아 batch-NN 파일로.
// 조금씩 나눠 검수하는 모드. apply:korean-meaning 이 batch 파일들을 자동으로 같이 읽는다.
const batchArg = process.argv.find((a) => a === '--batch' || a.startsWith('--batch='))
const isBatch = !!batchArg
const batchSize = batchArg?.includes('=') ? Math.max(1, Number(batchArg.split('=')[1])) : 40
const catArg = process.argv.find((a) => a.startsWith('--category='))?.split('=')[1]
const wantCategory = catArg && /^[123]$/.test(catArg) ? (Number(catArg) as 1 | 2 | 3) : undefined
const perTier = sampleArg ? Math.max(1, Number(sampleArg)) : wantAll || flaggedOnly ? Infinity : 30
const SEED = 20260907
const BROKEN = new Set(['empty', 'error', 'latin', 'cyrillic', 'kanji', 'kana', 'untranslated'])

// 배치 모드에서 이어서 쓸 파일 — 마지막 batch 파일에 미기입(?) 행이 남았으면 그걸 채우고, 아니면 다음 번호
function resolveBatchPath(): string {
  const existing = readdirSync(DICT_DIR)
    .map((f) => f.match(/^korean-meaning-worklist-batch-(\d+)\.tsv$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ f: m[0], n: Number(m[1]) }))
    .sort((a, b) => a.n - b.n)
  const last = existing.at(-1)
  if (last) {
    const grid = readTsv(join(DICT_DIR, last.f))
    const vi = grid[0].indexOf('verdict')
    if (grid.slice(1).some((c) => !/^[ox~s]$/.test((c[vi] ?? '').trim()))) return join(DICT_DIR, last.f)
  }
  return join(DICT_DIR, `korean-meaning-worklist-batch-${String((last?.n ?? 0) + 1).padStart(2, '0')}.tsv`)
}

// --flagged 는 별도 파일로 — tier별 표본 파일과 나란히 둔다
const OUT_PATH = isBatch
  ? resolveBatchPath()
  : join(DICT_DIR, flaggedOnly ? 'korean-meaning-worklist-flagged.tsv' : 'korean-meaning-worklist.tsv')

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
const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as { idioms: IdiomRecord[] }
const idiomById = new Map(idioms.map((i) => [i.id, i]))

// 영어 gloss 번역 (없으면 stdict 폴백만 있는 상태 — 그런 행은 llm_ko 가 빈다)
const meaning: Record<string, MeaningEntry> = existsSync(join(DICT_DIR, 'korean-meaning.json'))
  ? (JSON.parse(readFileSync(join(DICT_DIR, 'korean-meaning.json'), 'utf8')).byId as Record<string, MeaningEntry>)
  : {}

// stdict 정의 (참고 열) — korean-review.tsv 의 ko_definition
const stdictDef = new Map<string, string>()
{
  const p = join(DICT_DIR, 'korean-review.tsv')
  if (existsSync(p)) {
    const grid = readTsv(p)
    const h = grid[0]
    const [di, ii] = [h.indexOf('ko_definition'), h.indexOf('id')]
    for (const c of grid.slice(1)) {
      if (c[ii]) stdictDef.set(c[ii], (c[di] ?? '').replace(/\s+/g, ' '))
    }
  }
}

// Phase 3 수동 분류 verdict + 근거 — korean-worklist*.tsv 의 채워진 verdict + korean-review-sample.tsv 라벨
const manual = new Map<string, { verdict: 1 | 2 | 3; reason: string }>()
for (const f of readdirSync(DICT_DIR).filter((f) => /^korean-(worklist.*|review-sample)\.tsv$/.test(f))) {
  const grid = readTsv(join(DICT_DIR, f))
  const h = grid[0]
  const [vi, ii, ri] = [h.indexOf('verdict'), h.indexOf('id'), h.indexOf('llm_reason')]
  for (const c of grid.slice(1)) {
    const v = (c[vi] ?? '').trim()
    if (c[ii] && /^[123]$/.test(v)) manual.set(c[ii], { verdict: Number(v) as 1 | 2 | 3, reason: (c[ri] ?? '').replace(/\s+/g, ' ') })
  }
}

// 이 파일에서 채운 verdict·cat·fix·llm_ko 이어받기 (파일마다 독립 — 표본과 flagged 는 별개 검수면).
// llm_ko 도 이어받되, 갓 번역한 값(korean-meaning.json)과 다를 때만 = 사람이 직접 고친 경우만 산다.
const prior = new Map<string, { verdict: string; cat: string; fix: string; llmKo: string }>()
if (existsSync(OUT_PATH)) {
  const grid = readTsv(OUT_PATH)
  const h = grid[0]
  const [vi, ci, fi, ki, ii] = [
    h.indexOf('verdict'), h.indexOf('cat'), h.indexOf('fix'), h.indexOf('llm_ko'), h.indexOf('id'),
  ]
  if (ii >= 0) {
    for (const c of grid.slice(1)) {
      const v = (c[vi] ?? '').trim()
      if (!c[ii] || !/^[ox~s]$/.test(v)) continue
      const edited = (c[ki] ?? '').trim()
      const fresh = (meaning[c[ii]]?.ko ?? '').replace(/\s+/g, ' ').trim()
      prior.set(c[ii], {
        verdict: v,
        cat: (c[ci] ?? '').trim(),
        fix: (c[fi] ?? '').trim(),
        llmKo: edited && edited.replace(/\s+/g, ' ').trim() !== fresh ? edited : '',
      })
    }
  }
}

// 배치 모드 — 다른 korean-meaning-worklist*.tsv 에 이미 실린 id 는 이번 배치에서 뺀다 (중복 방지).
// 진행률 표시용으로 "실제 verdict 가 찍힌" id 도 따로 모은다.
const issuedElsewhere = new Set<string>()
const reviewedAnywhere = new Set<string>()
if (isBatch) {
  for (const f of readdirSync(DICT_DIR).filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f))) {
    const grid = readTsv(join(DICT_DIR, f))
    const [vi, ii] = [grid[0].indexOf('verdict'), grid[0].indexOf('id')]
    if (ii < 0) continue
    const self = join(DICT_DIR, f) === OUT_PATH
    for (const c of grid.slice(1)) {
      if (!c[ii]) continue
      if (!self) issuedElsewhere.add(c[ii])
      if (/^[ox~s]$/.test((c[vi] ?? '').trim())) reviewedAnywhere.add(c[ii])
    }
  }
}

interface Row {
  id: string
  it: IdiomRecord
  k: KoClass
  m?: MeaningEntry
  flags: string[]
  isManual: boolean
  catMismatch: boolean
  tier: number
}

const rows: Row[] = []
for (const [id, k] of Object.entries(byId)) {
  if (!k.koMeaning) continue
  if (isBatch && wantCategory && k.category !== wantCategory) continue
  if (isBatch && issuedElsewhere.has(id)) continue
  const it = idiomById.get(id)
  if (!it) continue
  const m = meaning[id]
  const mv = manual.get(id)
  const flags = [...(m?.flags ?? [])]
  // Phase 3 옛 분류(mv)와 현재 category 가 다르면 flag — 단, 이 행의 뜻 검수가 이미 찍혀 있으면
  // (prior 에 있으면) 사람이 그때 category 도 봤다고 보고 확정 처리해 flag 를 뗀다
  const catMismatch = !!mv && mv.verdict !== k.category && !prior.has(id)
  if (catMismatch) flags.push('cat-mismatch')
  const isManual = !!mv || k.classSource === 'manual'
  const broken = flags.some((f) => BROKEN.has(f))

  // 우선순위 tier — 낮을수록 먼저
  let tier: number
  if (catMismatch) tier = 1
  else if (broken) tier = 2
  else if (isManual && k.category === 2) tier = 1
  else if (isManual) tier = 3
  else if (k.category === 2) tier = 4
  else if (k.category === 3) tier = 5
  else tier = 6

  rows.push({ id, it, k, m, flags, isManual, catMismatch, tier })
}

// tier 안에서 결정론적 셔플 후 표본
function shuffle<T>(a: T[]): T[] {
  let s = SEED
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
const byTier = new Map<number, Row[]>()
for (const r of rows) (byTier.get(r.tier) ?? byTier.set(r.tier, []).get(r.tier)!).push(r)

// 배치 정렬 — 깨진 번역 먼저 → 밴드 낮은 순(자주 나올 카드 먼저) → 표기
const isBroken = (r: Row) => (r.flags.some((f) => BROKEN.has(f)) ? 0 : 1)
const batchOrder = (a: Row, b: Row) =>
  isBroken(a) - isBroken(b) ||
  priorityToBand(a.it.priority) - priorityToBand(b.it.priority) ||
  a.it.headword.localeCompare(b.it.headword)

let picked: Row[]
if (isBatch) {
  // 이 배치 파일에 이미 채운 것은 유지, 나머지는 batchSize 까지 새로 채운다
  const kept = rows.filter((r) => prior.has(r.id))
  const rest = rows.filter((r) => !prior.has(r.id)).sort(batchOrder)
  picked = [...kept, ...rest.slice(0, Math.max(0, batchSize - kept.length))]
  picked.sort(batchOrder)
} else if (flaggedOnly) {
  // 플래그가 붙은 행(깨진 번역 등) + 이미 검수 verdict 가 찍힌 행 전량. 표본 안 뽑는다.
  // 검수한 행을 계속 담아 두어야 이 파일 하나가 "할 일 + 검수 기록" 노릇을 한다
  picked = rows.filter((r) => r.flags.length > 0 || prior.has(r.id))
  picked.sort((a, b) => a.tier - b.tier || a.k.category - b.k.category || priorityToBand(a.it.priority) - priorityToBand(b.it.priority) || a.it.headword.localeCompare(b.it.headword))
} else {
  picked = []
  for (const [, list] of [...byTier].sort((a, b) => a[0] - b[0])) {
    const kept = list.filter((r) => prior.has(r.id))
    const rest = shuffle(list.filter((r) => !prior.has(r.id)))
    const take = Number.isFinite(perTier) ? Math.max(0, perTier - kept.length) : Infinity
    picked.push(...kept, ...rest.slice(0, take))
  }
  picked.sort((a, b) => a.tier - b.tier || a.k.category - b.k.category || priorityToBand(a.it.priority) - priorityToBand(b.it.priority) || a.it.headword.localeCompare(b.it.headword))
}

const header = [
  'verdict', 'cat', 'fix', 'tier', 'flags', 'manual',
  'headword', 'reading', 'glossEn', 'llm_ko', 'stdict_def', 'manual_reason',
  'category', 'classSource', 'band', 'id',
].join('\t')

const body = picked.map((r) => {
  const p = prior.get(r.id)
  return [
    p?.verdict ?? '?',
    p?.cat ?? '',
    p?.fix ?? '',
    r.tier,
    r.flags.join(','),
    r.isManual ? (manual.get(r.id) ? `Y(${manual.get(r.id)!.verdict})` : 'Y') : '',
    r.it.headword,
    r.it.reading,
    r.it.glossEn.slice(0, 4).join('; '),
    // 이어받은 사람 수정 > 현재 반영된 정의(korean-class.json) > 갓 번역한 것
    p?.llmKo || r.k.koMeaning?.definition || r.m?.ko || '',
    stdictDef.get(r.id) ?? '',
    manual.get(r.id)?.reason ?? '',
    r.k.category,
    r.k.classSource,
    priorityToBand(r.it.priority),
    r.id,
  ].join('\t')
})

writeTsvBom(OUT_PATH, header + '\n' + body.join('\n') + '\n')

if (isBatch) {
  const catLabel = wantCategory ? { 1: '동형동의', 2: '동형이의', 3: '일본고유' }[wantCategory] : '전체'
  const pool = Object.entries(byId).filter(([, k]) => k.koMeaning && (!wantCategory || k.category === wantCategory))
  const total = pool.length
  const reviewed = pool.filter(([id]) => reviewedAnywhere.has(id)).length
  const newCount = picked.filter((r) => !prior.has(r.id)).length
  const bandBreak: Record<number, number> = {}
  for (const r of picked) bandBreak[priorityToBand(r.it.priority)] = (bandBreak[priorityToBand(r.it.priority)] ?? 0) + 1
  const bandStr = Object.entries(bandBreak).sort().map(([b, n]) => `밴드${b}:${n}`).join(' ')
  const brokenInBatch = picked.filter((r) => r.flags.some((f) => BROKEN.has(f))).length
  console.log(`→ ${OUT_PATH}`)
  console.log(`  ${catLabel} ${total}건 중 검수 ${reviewed} · 남은 ${total - reviewed} · 이번 배치 ${picked.length}행` +
    (prior.size ? ` (이어받음 ${prior.size} + 신규 ${newCount})` : '') + `  [${bandStr}]`)
  if (brokenInBatch) console.log(`  ⚠ 깨진 번역 ${brokenInBatch}건 포함 — 배치 맨 앞`)
  console.log(`\n  verdict 채우고: npm run apply:korean-meaning -- --validate`)
  console.log(`  다음 배치: npm run build:korean-meaning-worklist -- --batch${wantCategory ? ` --category=${wantCategory}` : ''}`)
  process.exit(0)
}

const mode = flaggedOnly ? '플래그 전량' : Number.isFinite(perTier) ? `tier별 표본 ${perTier}` : '전체'
console.log(`→ ${OUT_PATH}  (${picked.length}행, ${mode}, 이어받은 verdict ${prior.size}건)`)

// 플래그 분해 — 무엇을 왜 검수해야 하는지
const FLAG_NOTE: Record<string, string> = {
  error: '번역 실패 (빈 뜻)',
  latin: '인코딩 깨짐 (<0x..>) 또는 영어 잔존 — 반드시 고침',
  cyrillic: '키릴 문자 — 반드시 고침',
  kana: '일본어 가나 잔존',
  kanji: '한자 잔존 (괄호 병기는 대개 良性)',
  untranslated: '영어 gloss 를 그대로 둠',
  'many-senses': '뜻이 너무 잘게 나뉨',
  long: '40자 초과',
  empty: '빈 뜻',
  'cat-mismatch': '수동 분류와 category 불일치',
}
const flagCount: Record<string, number> = {}
for (const r of rows) for (const f of r.flags) flagCount[f in FLAG_NOTE ? f : 'error'] = (flagCount[f in FLAG_NOTE ? f : 'error'] ?? 0) + 1
const qualityRows = rows.filter((r) => r.flags.some((f) => f !== 'cat-mismatch')).length
const doneInFile = picked.filter((r) => r.flags.length === 0 && prior.has(r.id)).length
console.log(
  `\n검수 필요 — 아직 ${qualityRows}행 (번역 품질 플래그) + 분류 불일치 ${flagCount['cat-mismatch'] ?? 0}` +
    (doneInFile ? ` · 검수 완료 기록 ${doneInFile}행 포함` : ''),
)
for (const [f, n] of Object.entries(flagCount).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${f.padEnd(13)} ${String(n).padStart(4)}   ${FLAG_NOTE[f] ?? ''}`)
}

const tierLabel: Record<number, string> = {
  1: '수동검수·동형이의 / 분류 불일치  최우선',
  2: '출력 이상 플래그  깨진 번역',
  3: '수동검수·동형동의·일본고유',
  4: '동형이의 (미검수)',
  5: '일본고유 (뜻이 새로 생김)',
  6: '동형동의 (미검수)  훑기',
}
console.log('\ntier별 (전체 / 이번 파일):')
for (const [t, list] of [...byTier].sort((a, b) => a[0] - b[0])) {
  const inFile = picked.filter((r) => r.tier === t).length
  console.log(`  T${t} ${String(list.length).padStart(6)} / ${String(inFile).padStart(4)}   ${tierLabel[t]}`)
}
console.log(`\n검수 표기 — o 맞음 · x 틀림(fix) · ~ 애매(fix 메모) · s stdict_def 채택 · ? 미기입`)
console.log(`깨진 것만 전량 --flagged · 전체 --all · tier별 표본 --sample=N · 조금씩 --batch [--category=1|2|3]`)
