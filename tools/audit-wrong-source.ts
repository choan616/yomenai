// 「굳은 오답」(같은 오답을 두 번 이상 낸 상습 표현)의 출처를 규칙별로 짝지어 보는 실측 스크립트 (PLAN §11 D4).
//
// 구현이 아니라 판단 재료다 — 결정은 사람이 한다. 규칙 정의·우선순위·한계는 실행 출력 끝에도 적는다.
// 입력 — data/events/*.json (audit-plateau 와 같다. 같은 id 는 한 번만 센다), public/dict/{base,kanji}.json.
//   기록에 있는데 base.json 에 없는 표현(band4·wide)은 그 파일에서 꺼내 대상·출처 양쪽에 넣는다.
//
// 규칙 (한 표현이 여러 규칙에 걸릴 수 있다 — 걸림은 규칙마다 따로 세고, 분류는 아래 우선순위로 하나만 준다)
//   R1  굳은 오답 W 가 **다른 표현의 읽기와 그대로 같다** (동음 혼동)
//   R2  기대 읽기를 한자별 조각으로 나눠 W 와 맞춰 보면 틀린 조각이 하나이고, 그 한자가 **다른 표현**에서
//       W 의 그 조각 읽기로 읽힌다. 「이미 학습한」 = 그 오답이 **처음 나온 시각 이전**에 읽기 카드를 푼 표현
//   R2' R2 와 같되 출처를 사전(base.json) 전체로 넓힌다 — 학습 여부 무관
//   R3  W 가 기대 읽기와 탁음·반탁음·촉음·장음 차이뿐이다
//   R4  W 의 기존 `mistakeType` 이 KO_INTERFERENCE
// 분류 우선순위: R1 > R2 > R3 > R4 > R2'/R1' 만 걸림(출처가 사전에만 있음) > 미분류.
//   앞 둘은 사용자가 이미 만난 구체적 표현을 가리켜 나란히 보일 수 있다. R3·R4 는 유형만 가리킨다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareEvents, type LearningEvent, type MistakeType, type ReviewEvent } from '../src/core/types.ts'
import { alignWrong, type Alignment, type Chunk } from '../src/core/repeatWrong.ts'
import { decompose, type KanjiReadings } from '../src/lib/onyomi.ts'
import { sameExceptVoicing, sokuonVariants, stripLongVowels, toHiragana } from '../src/lib/readings.ts'
import { CHRONIC_WRONG } from './audit-plateau.ts'

const ROOT = join(import.meta.dirname, '..')
const arg = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1]
const EVENTS_DIR = arg('dir') ?? join(ROOT, 'data', 'events')
const DICT_DIR = join(ROOT, 'public', 'dict')
const SEED = Number(arg('seed') ?? 20261024)
const SAMPLE_N = 5
const DECOY_DRAWS = 20

export interface DictIdiom {
  id: string
  headword: string
  reading: string
}

// 조각 정렬(`alignWrong`)은 런타임 피드백(D4)과 같은 로직이라 src/core/repeatWrong.ts 한 곳에 둔다
export { alignWrong, type Alignment, type Chunk }

export type BoundaryKind = 'voicing' | 'sokuon' | 'choon'

/** 기대 읽기와 W 가 탁음·촉음·장음 차이뿐이면 그 갈래, 아니면 null (같은 문자열도 null) */
export function boundaryKind(expected: string, wrong: string): BoundaryKind | null {
  if (expected === wrong) return null
  if (sameExceptVoicing(expected, wrong)) return 'voicing'
  if (sokuonVariants(expected).includes(wrong) || sokuonVariants(wrong).includes(expected)) return 'sokuon'
  if (stripLongVowels(expected) === stripLongVowels(wrong)) return 'choon'
  return null
}

export interface RepeatedWrong {
  wrong: string
  count: number
  /** 이 오답이 처음 나온 시각 */
  firstAt: number
  mistakeType: MistakeType | null
}

/**
 * 한 표현의 읽기 오답 이력(시간순)에서 굳은 오답을 고른다. 누적 오답 `CHRONIC_WRONG` 회+ 이고 같은 답을
 * 2회 이상 낸 경우만이다. 공백 답은 「모르겠다」이지 출처가 있는 오답이 아니라 후보에서 뺀다.
 * 후보가 여럿이면 많이 낸 것, 같으면 먼저 나온 것. `mistakeType` 은 그 오답 이벤트들의 최빈 비-null 값.
 */
export function repeatedWrong(history: readonly ReviewEvent[]): RepeatedWrong | null {
  const wrongs = history.filter((e) => !e.correct)
  if (wrongs.length < CHRONIC_WRONG) return null
  const by = new Map<string, ReviewEvent[]>()
  for (const e of wrongs) {
    const w = toHiragana(e.answer.trim())
    if (w === '') continue
    const list = by.get(w)
    if (list) list.push(e)
    else by.set(w, [e])
  }
  let best: [string, ReviewEvent[]] | null = null
  for (const entry of by) {
    if (entry[1].length < 2) continue
    if (best === null || entry[1].length > best[1].length) best = entry
  }
  if (best === null) return null
  const types = new Map<MistakeType, number>()
  for (const e of best[1]) if (e.mistakeType !== null) types.set(e.mistakeType, (types.get(e.mistakeType) ?? 0) + 1)
  let mistakeType: MistakeType | null = null
  let top = 0
  for (const [t, n] of types) {
    if (n > top) {
      top = n
      mistakeType = t
    }
  }
  return { wrong: best[0], count: best[1].length, firstAt: best[1][0]!.at, mistakeType }
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function sample<T>(items: readonly T[], n: number, rng: () => number): T[] {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a.slice(0, n)
}

export type RuleClass = 'R1' | 'R2' | 'R3' | 'R4' | 'DICT_ONLY' | 'NONE'

export interface Case {
  idiomId: string
  headword: string
  expected: string
  wrong: string
  count: number
  firstAt: number
  mistakeType: MistakeType | null
  align: Alignment
  /** W 와 읽기가 같은 다른 표현 — 학습한 것 / 사전 전체 */
  homoLearned: string[]
  homoDict: string[]
  /** 틀린 조각을 그 읽기로 읽는 다른 표현 — 학습한 것 / 그중 정답 경험 있는 것 / 사전 전체 */
  srcLearned: string[]
  srcKnown: string[]
  /** srcLearned 중 같은 자리(조각 수·위치 같음)에서 같은 읽기로 읽히는 것 */
  srcSlot: string[]
  srcDict: string[]
  boundary: BoundaryKind | null
  ko: boolean
  cls: RuleClass
}

export interface Report {
  /** 읽기 카드 오답 누적 CHRONIC_WRONG 회+ 표현 수 */
  chronic: number
  /** 그중 같은 답(공백 포함)을 2회 이상 낸 표현 — audit-plateau 와 같은 정의 */
  repeatedWithEmpty: number
  /** 공백 답을 뺀 굳은 오답 표현 = 분석 대상 */
  cases: Case[]
  /** 사전·분해 문제로 대상에서 빠진 표현 수 */
  skipped: { noDict: number; noParse: number }
  /** 사전 읽기와 기록의 expected 가 다른 표현 수 */
  expectedMismatch: number
  /** 사전 전체 대조 */
  mutual: { strict: Pair[]; dict: Pair[] }
  decoy: { aligned: number; learnedRate: number; dictRate: number }
  idiomById: Map<string, DictIdiom>
}

export interface Pair {
  a: string
  b: string
  kanji: string
}

interface Parsed {
  idiom: DictIdiom
  chunks: Chunk[] | null
}

/** 순수 분석. 사전 목록·한자 읽기 조회·이벤트만 받는다 */
export function analyze(
  events: readonly LearningEvent[],
  idioms: readonly DictIdiom[],
  lookup: (k: string) => KanjiReadings | undefined,
  seed = SEED,
): Report {
  const reads = events
    .filter((e): e is ReviewEvent => e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null)
    .sort(compareEvents)
  const byIdiom = new Map<string, ReviewEvent[]>()
  const firstSeen = new Map<string, number>()
  const firstCorrect = new Map<string, number>()
  for (const e of reads) {
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
    if (!firstSeen.has(e.idiomId)) firstSeen.set(e.idiomId, e.at)
    if (e.correct && !firstCorrect.has(e.idiomId)) firstCorrect.set(e.idiomId, e.at)
  }

  const idiomById = new Map(idioms.map((i) => [i.id, i]))
  const parsed = new Map<string, Parsed>()
  const byReading = new Map<string, string[]>()
  const bySurface = new Map<string, string[]>()
  const poolByLen = new Map<number, string[]>()
  const push = <K>(m: Map<K, string[]>, k: K, v: string): void => {
    const list = m.get(k)
    if (list) list.push(v)
    else m.set(k, [v])
  }
  for (const idiom of idioms) {
    const d = decompose(idiom.headword, idiom.reading, lookup)
    const chunks = d.ok ? d.segments.map((s) => ({ kanji: s.kanji, surface: s.surface })) : null
    parsed.set(idiom.id, { idiom, chunks })
    push(byReading, idiom.reading, idiom.id)
    if (chunks === null) continue
    const seen = new Set<string>()
    for (const c of chunks) {
      const key = `${c.kanji}|${c.surface}`
      if (!seen.has(key)) {
        seen.add(key)
        push(bySurface, key, idiom.id)
      }
      push(poolByLen, c.surface.length, c.surface)
    }
  }

  const learnedBefore = (id: string, at: number, self: string): boolean =>
    id !== self && (firstSeen.get(id) ?? Infinity) < at
  const knownBefore = (id: string, at: number): boolean => (firstCorrect.get(id) ?? Infinity) < at

  let chronic = 0
  let repeatedWithEmpty = 0
  const skipped = { noDict: 0, noParse: 0 }
  let expectedMismatch = 0
  const cases: Case[] = []
  for (const [id, history] of byIdiom) {
    const wrongs = history.filter((e) => !e.correct)
    if (wrongs.length < CHRONIC_WRONG) continue
    chronic++
    const counts = new Map<string, number>()
    for (const e of wrongs) counts.set(e.answer, (counts.get(e.answer) ?? 0) + 1)
    if (Math.max(...counts.values()) >= 2) repeatedWithEmpty++

    const rw = repeatedWrong(history)
    if (rw === null) continue
    const p = parsed.get(id)
    if (p === undefined) {
      skipped.noDict++
      continue
    }
    if (history[0]!.expected !== p.idiom.reading) expectedMismatch++
    const wd = decompose(p.idiom.headword, rw.wrong, lookup)
    const align = alignWrong(
      p.chunks,
      rw.wrong,
      wd.ok ? wd.segments.map((x) => ({ kanji: x.kanji, surface: x.surface })) : null,
    )
    if (p.chunks === null) skipped.noParse++

    const homoDict = (byReading.get(rw.wrong) ?? []).filter((x) => x !== id)
    const homoLearned = homoDict.filter((x) => learnedBefore(x, rw.firstAt, id))
    let srcDict: string[] = []
    if (align.ok) srcDict = (bySurface.get(`${align.kanji}|${align.wrong}`) ?? []).filter((x) => x !== id)
    const srcLearned = srcDict.filter((x) => learnedBefore(x, rw.firstAt, id))
    const srcKnown = srcLearned.filter((x) => knownBefore(x, rw.firstAt))
    const srcSlot = srcLearned.filter((x) => {
      if (!align.ok || p.chunks === null) return false
      const ch = parsed.get(x)?.chunks
      return ch?.length === p.chunks.length && ch[align.index]?.kanji === align.kanji && ch[align.index]?.surface === align.wrong
    })
    const boundary = boundaryKind(p.idiom.reading, rw.wrong)
    const ko = rw.mistakeType === 'KO_INTERFERENCE'

    let cls: RuleClass = 'NONE'
    if (homoLearned.length > 0) cls = 'R1'
    else if (srcLearned.length > 0) cls = 'R2'
    else if (boundary !== null) cls = 'R3'
    else if (ko) cls = 'R4'
    else if (homoDict.length > 0 || srcDict.length > 0) cls = 'DICT_ONLY'

    cases.push({
      idiomId: id,
      headword: p.idiom.headword,
      expected: p.idiom.reading,
      wrong: rw.wrong,
      count: rw.count,
      firstAt: rw.firstAt,
      mistakeType: rw.mistakeType,
      align,
      homoLearned,
      homoDict,
      srcLearned,
      srcKnown,
      srcSlot,
      srcDict,
      boundary,
      ko,
      cls,
    })
  }

  // 서로 거꾸로 짝 — A 의 틀린 조각 (K, 기대 Y → 오답 X) 와 B 의 (K, 기대 X → 오답 Y) 가 맞물린다
  const caseById = new Map(cases.map((c) => [c.idiomId, c]))
  const findMutual = (srcOf: (c: Case) => string[]): Pair[] => {
    const out = new Map<string, Pair>()
    for (const a of cases) {
      if (!a.align.ok) continue
      for (const bid of srcOf(a)) {
        const b = caseById.get(bid)
        if (!b || !b.align.ok) continue
        if (b.align.kanji !== a.align.kanji) continue
        if (b.align.expected !== a.align.wrong || b.align.wrong !== a.align.expected) continue
        if (!srcOf(b).includes(a.idiomId)) continue
        const [x, y] = a.idiomId < b.idiomId ? [a.idiomId, b.idiomId] : [b.idiomId, a.idiomId]
        out.set(`${x}|${y}`, { a: x, b: y, kanji: a.align.kanji })
      }
    }
    return [...out.values()]
  }
  const mutual = { strict: findMutual((c) => c.srcLearned), dict: findMutual((c) => c.srcDict) }

  // 대조군 — 틀린 조각을 같은 길이의 아무 조각으로 바꿔 놓아도 이만큼 걸리나
  const rng = mulberry32(seed)
  let aligned = 0
  let hitLearned = 0
  let hitDict = 0
  let draws = 0
  for (const c of cases) {
    if (!c.align.ok) continue
    aligned++
    const pool = poolByLen.get(c.align.wrong.length) ?? []
    if (pool.length === 0) continue
    for (let d = 0; d < DECOY_DRAWS; d++) {
      const x = pool[Math.floor(rng() * pool.length)]!
      if (x === c.align.expected) continue
      draws++
      const ids = (bySurface.get(`${c.align.kanji}|${x}`) ?? []).filter((i) => i !== c.idiomId)
      if (ids.length > 0) hitDict++
      if (ids.some((i) => learnedBefore(i, c.firstAt, c.idiomId))) hitLearned++
    }
  }
  const decoy = {
    aligned,
    learnedRate: draws > 0 ? hitLearned / draws : 0,
    dictRate: draws > 0 ? hitDict / draws : 0,
  }

  return { chronic, repeatedWithEmpty, cases, skipped, expectedMismatch, mutual, decoy, idiomById }
}

const pct = (a: number, b: number): string => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—')

function bucket(n: number): string {
  return n === 1 ? '1' : n <= 3 ? '2~3' : n <= 9 ? '4~9' : '10+'
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다. 백업 JSON 을 넣는다 (--dir= 로 다른 경로 지정 가능).`)
    process.exit(1)
  }
  const seen = new Map<string, LearningEvent>()
  for (const f of readdirSync(EVENTS_DIR).filter((x) => x.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) continue
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }
  const events = [...seen.values()]

  const kanjiRaw = (JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
    kanji: Record<string, { on: string[]; kun: string[] }>
  }).kanji
  const lookup = (k: string): KanjiReadings | undefined => {
    const r = kanjiRaw[k]
    return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
  }
  const loadIdioms = (f: string): DictIdiom[] =>
    (JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8')) as { idioms: DictIdiom[] }).idioms.map((i) => ({
      id: i.id,
      headword: i.headword,
      reading: i.reading,
    }))
  const idioms = loadIdioms('base.json')
  const have = new Set(idioms.map((i) => i.id))
  const studied = new Set(events.filter((e) => e.type === 'review' && e.cardType === 'reading').map((e) => e.idiomId))
  for (const f of ['band4.json', 'wide.json']) {
    for (const i of loadIdioms(f)) if (studied.has(i.id) && !have.has(i.id)) idioms.push(i)
  }

  const r = analyze(events, idioms, lookup)
  const cs = r.cases
  const n = cs.length
  const idiomOf = (id: string): string => {
    const i = r.idiomById.get(id)
    return i ? `${i.headword}(${i.reading})` : id
  }

  console.log('=== 굳은 오답의 출처 실측 (D4) ===')
  console.log(`읽기 카드 오답 ${CHRONIC_WRONG}회+ 표현 ${r.chronic}개`)
  console.log(`  같은 답을 두 번 이상 낸 표현 ${r.repeatedWithEmpty}개 (audit-plateau 와 같은 정의, 공백 답 포함)`)
  console.log(`  공백 답을 빼면 분석 대상 ${n}개 (공백뿐인 반복 ${r.repeatedWithEmpty - n - r.skipped.noDict}개 제외)`)
  console.log(`  사전에 없어 제외 ${r.skipped.noDict}개, 기대 읽기 분해 실패 ${r.skipped.noParse}개(분류는 R1·R3·R4 만 가능), 사전 읽기 ≠ 기록 expected ${r.expectedMismatch}개`)
  console.log(`  출처 후보는 base.json 표현 + 기록에 있는 band4·wide 표현. 「학습한」 = 그 오답이 처음 나온 시각 이전에 읽기 카드를 푼 표현`)

  console.log('')
  console.log('--- 정렬 (기대 읽기를 한자 조각으로 나눠 W 와 맞춤) ---')
  const al = { ok: 0, NO_PARSE: 0, NO_SINGLE: 0, AMBIGUOUS: 0 }
  for (const c of cs) {
    if (c.align.ok) al.ok++
    else al[c.align.reason]++
  }
  console.log(`  조각 하나만 틀림 ${al.ok}개 (${pct(al.ok, n)})`)
  console.log(`  실패: 조각 둘 이상 틀림·글자 누락 ${al.NO_SINGLE}개, 맞는 자리가 여럿 ${al.AMBIGUOUS}개, 기대 읽기 분해 실패 ${al.NO_PARSE}개`)
  const failRng = mulberry32(SEED + 1)
  for (const reason of ['NO_SINGLE', 'AMBIGUOUS'] as const) {
    const pool = cs.filter((c) => !c.align.ok && c.align.reason === reason)
    const shown = sample(pool, SAMPLE_N, failRng).map((c) => `${c.headword} ${c.expected}→${c.wrong}`)
    console.log(`    ${reason} 표본: ${shown.join(' / ')}`)
  }

  console.log('')
  console.log('--- 규칙별 걸림 (겹침 허용) ---')
  const count = (f: (c: Case) => boolean): number => cs.filter(f).length
  const al_n = al.ok
  const rows: [string, number, number][] = [
    ['R1  다른 표현의 읽기 그대로 (학습한 표현)', count((c) => c.homoLearned.length > 0), n],
    ["R1' 같음 (사전 전체)", count((c) => c.homoDict.length > 0), n],
    ['R2  조각 대체 (학습한 표현이 출처)', count((c) => c.srcLearned.length > 0), al_n],
    ['    그중 출처에서 정답 경험이 있는 것', count((c) => c.srcKnown.length > 0), al_n],
    ["R2' 조각 대체 (사전 전체가 출처)", count((c) => c.srcDict.length > 0), al_n],
    ['R3  탁음·촉음·장음 차이뿐', count((c) => c.boundary !== null), n],
    ['R4  KO_INTERFERENCE', count((c) => c.ko), n],
  ]
  for (const [label, k, d] of rows) console.log(`  ${label}: ${k}개 (${pct(k, d)} of ${d === n ? '전체' : '정렬 성공'} ${d})`)
  console.log(`  R2 대 R2' 차이: 사전에는 출처가 있으나 학습한 적 없는 것 ${count((c) => c.srcDict.length > 0 && c.srcLearned.length === 0)}개`)
  console.log(`  대조군(틀린 조각을 같은 길이의 아무 조각으로 바꿔도 걸리는 비율, 시드 ${SEED}, ${r.decoy.aligned}건×${DECOY_DRAWS}회): R2 ${(r.decoy.learnedRate * 100).toFixed(1)}%, R2' ${(r.decoy.dictRate * 100).toFixed(1)}%`)

  console.log('')
  console.log('--- 겹침 ---')
  const sub = (a: (c: Case) => boolean, b: (c: Case) => boolean): number => count((c) => a(c) && b(c))
  const isR2 = (c: Case): boolean => c.srcLearned.length > 0
  const isR1 = (c: Case): boolean => c.homoLearned.length > 0
  const isR3 = (c: Case): boolean => c.boundary !== null
  console.log(`  R2∧R3 ${sub(isR2, isR3)}, R2∧R4 ${sub(isR2, (c) => c.ko)}, R1∧R2 ${sub(isR1, isR2)}, R1∧R3 ${sub(isR1, isR3)}`)
  console.log(`  R3 갈래: 탁음 ${count((c) => c.boundary === 'voicing')}, 촉음 ${count((c) => c.boundary === 'sokuon')}, 장음 ${count((c) => c.boundary === 'choon')}`)
  const r1d = cs.filter((c) => c.homoDict.length > 0)
  const short = (c: Case): boolean => c.wrong.length <= 3
  console.log(`  R1(학습) 를 W 길이로: 3자 이하 ${sub(isR1, short)}/${count(short)}, 4자 이상 ${sub(isR1, (c) => !short(c))}/${count((c) => !short(c))} (사전 전체 R1' ${r1d.length})`)

  console.log('')
  console.log('--- R3 와 기존 mistakeType 대조 ---')
  const mt = (c: Case): string => c.mistakeType ?? 'null'
  const typeOf: Record<BoundaryKind, string> = { voicing: 'RENDAKU', sokuon: 'SOKUON', choon: 'CHOON' }
  const boundaryTypes = new Set(['RENDAKU', 'SOKUON', 'CHOON'])
  const r3 = cs.filter(isR3)
  const r3Match = r3.filter((c) => mt(c) === typeOf[c.boundary!]).length
  const r3AnyBoundary = r3.filter((c) => boundaryTypes.has(mt(c))).length
  console.log(`  R3 ${r3.length}개 중 mistakeType 이 같은 갈래 ${r3Match}개 (${pct(r3Match, r3.length)}), 셋 중 아무거나 ${r3AnyBoundary}개 (${pct(r3AnyBoundary, r3.length)})`)
  const mtOfR3 = new Map<string, number>()
  for (const c of r3) mtOfR3.set(mt(c), (mtOfR3.get(mt(c)) ?? 0) + 1)
  console.log(`  R3 의 mistakeType 분포: ${[...mtOfR3].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`)
  const notR3 = cs.filter((c) => !isR3(c) && boundaryTypes.has(mt(c)))
  console.log(`  mistakeType 은 RENDAKU·SOKUON·CHOON 인데 R3 가 아닌 것 ${notR3.length}개 (기존 분류가 R3 보다 넓게 잡은 경우)`)

  console.log('')
  console.log('--- 우선순위 분류 (R1 > R2 > R3 > R4 > 사전에만 출처 > 미분류) ---')
  const label: Record<RuleClass, string> = {
    R1: 'R1  동음 혼동',
    R2: 'R2  조각 대체(학습한 출처)',
    R3: 'R3  탁음·촉음·장음 차이뿐',
    R4: 'R4  KO_INTERFERENCE',
    DICT_ONLY: "R1'·R2' 만 (출처가 사전에만)",
    NONE: '미분류',
  }
  for (const k of Object.keys(label) as RuleClass[]) {
    console.log(`  ${label[k]}: ${count((c) => c.cls === k)}개 (${pct(count((c) => c.cls === k), n)})`)
  }

  console.log('')
  console.log('--- R2 출처 후보 수 (한 표현에 붙는 짝 표현이 몇 개인가) ---')
  const fan = new Map<string, number>()
  for (const c of cs) if (c.srcLearned.length > 0) fan.set(bucket(c.srcLearned.length), (fan.get(bucket(c.srcLearned.length)) ?? 0) + 1)
  const fanDict = new Map<string, number>()
  for (const c of cs) if (c.srcDict.length > 0) fanDict.set(bucket(c.srcDict.length), (fanDict.get(bucket(c.srcDict.length)) ?? 0) + 1)
  const order = ['1', '2~3', '4~9', '10+']
  console.log(`  R2  (학습한 출처): ${order.map((b) => `${b}개 ${fan.get(b) ?? 0}`).join(', ')}`)
  console.log(`  R2' (사전 전체):   ${order.map((b) => `${b}개 ${fanDict.get(b) ?? 0}`).join(', ')}`)
  const r2n = cs.filter(isR2)
  const med = (xs: number[]): number => (xs.length === 0 ? 0 : [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!)
  console.log(`  중앙값: R2 ${med(r2n.map((c) => c.srcLearned.length))}개, R2' ${med(cs.filter((c) => c.srcDict.length > 0).map((c) => c.srcDict.length))}개`)
  const r2r3 = r2n.filter(isR3)
  const r2nonR3 = r2n.filter((c) => !isR3(c))
  console.log(`  R2 중 탁음 등 경계 차이(R3) ${r2r3.length}개 / 아예 다른 읽기로 대체 ${r2nonR3.length}개 (후자의 중앙값 출처 수 ${med(r2nonR3.map((c) => c.srcLearned.length))})`)

  const narrowR2 = r2nonR3.filter((c) => c.srcLearned.length <= 3)
  const slotted = cs.filter((c) => c.srcSlot.length > 0)
  console.log(`  좁히기 ① 다른 읽기 대체(R2 이고 R3 아님)이면서 출처 3개 이하: ${narrowR2.length}개`)
  console.log(`  좁히기 ② 같은 자리(조각 수·위치 같음)에서 읽히는 출처가 있음: ${slotted.length}개, 중앙값 ${med(slotted.map((c) => c.srcSlot.length))}개 (R2 ${r2n.length}개 중)`)
  const mutualIds = new Set(r.mutual.strict.flatMap((p) => [p.a, p.b]))
  const narrowUnion = cs.filter((c) => isR1(c) || narrowR2.includes(c) || mutualIds.has(c.idiomId))
  console.log(`  좁은 짝이 붙는 표현 (R1 ∪ 좁히기① ∪ 서로 거꾸로): ${narrowUnion.length}개 (${pct(narrowUnion.length, n)} of 전체 ${n})`)

  console.log('')
  console.log('--- 서로 거꾸로 짝 (A 의 틀린 조각이 B 의 읽기이고 B 의 틀린 조각이 A 의 읽기 — 砂子·店子 형) ---')
  const ids = (ps: Pair[]): number => new Set(ps.flatMap((p) => [p.a, p.b])).size
  console.log(`  R2  (학습한 출처, 오답이 처음 나온 시각 기준): ${r.mutual.strict.length}쌍 (표현 ${ids(r.mutual.strict)}개)`)
  console.log(`  R2' (사전 전체):                                ${r.mutual.dict.length}쌍 (표현 ${ids(r.mutual.dict)}개)`)
  const kanjiOf = new Map<string, number>()
  for (const p of r.mutual.strict) kanjiOf.set(p.kanji, (kanjiOf.get(p.kanji) ?? 0) + 1)
  console.log(`  R2 짝이 걸린 한자 ${kanjiOf.size}종: ${[...kanjiOf].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}${v}`).join(' ')}`)
  for (const p of r.mutual.strict.slice(0, 8)) {
    const ca = cs.find((c) => c.idiomId === p.a)!
    const cb = cs.find((c) => c.idiomId === p.b)!
    console.log(`    ${p.kanji}: ${idiomOf(p.a)} ← ${ca.wrong} / ${idiomOf(p.b)} ← ${cb.wrong}`)
  }

  console.log('')
  console.log(`--- 규칙별 무작위 표본 ${SAMPLE_N}건 (시드 ${SEED}) ---`)
  const rng = mulberry32(SEED)
  const partner = (c: Case): string => {
    const from = c.cls === 'R1' ? c.homoLearned : c.srcLearned.length > 0 ? c.srcLearned : c.srcDict
    const extra = c.cls === 'R1' ? '' : c.align.ok ? ` [${c.align.kanji}: ${c.align.expected}→${c.align.wrong}]` : ''
    if (from.length === 0) return `-${extra}`
    const note = c.cls === 'DICT_ONLY' || (c.cls !== 'R1' && c.srcLearned.length === 0) ? ' (사전에서)' : ''
    return `${from.slice(0, 2).map(idiomOf).join(' · ')}${from.length > 2 ? ` 외 ${from.length - 2}` : ''}${note}${extra}`
  }
  for (const k of Object.keys(label) as RuleClass[]) {
    const pool = cs.filter((c) => c.cls === k)
    console.log(`  [${label[k]}] ${pool.length}개 중`)
    for (const c of sample(pool, SAMPLE_N, rng)) {
      console.log(`    ${c.headword} 기대 ${c.expected} / 굳은 오답 ${c.wrong} ×${c.count} (${mt(c)}) / 짝 ${partner(c)}`)
    }
  }

  console.log('')
  console.log('--- 읽는 법과 한계 ---')
  for (const line of [
    '한 사람·8주 기록이다. 굳은 오답 W 는 표현마다 하나(최다 반복, 같으면 먼저 나온 것)만 본다.',
    '「학습한」 = 읽기 카드를 한 번이라도 푼 표현. 뜻 카드·찾기에서 열어 본 기록은 안 센다. 출처가 사전에만 있는 경우는 화면에 못 올린다.',
    '틀린 조각 정렬은 기대 읽기를 decompose 로 나눈 결과에 의존한다. 분해가 틀리면 조각이 어긋난다.',
    'R3 는 문자열 관계라 정렬과 무관하게 센다. 탁음 반전(こ→ご)은 R2 와 R3 에 함께 걸리고 출처 수가 커서, R2 의 이 부분은 일반 규칙을 되풀이할 뿐이다.',
    '대조군은 같은 길이의 임의 조각이라 사용자가 고른 그럴듯한 오답보다 쉽게 빗나간다. 걸림 비율의 하한선이지 우연의 상한이 아니다.',
    '서로 거꾸로 짝은 두 표현 모두 굳은 오답이어야 하고 각자 반대편을 오답 이전에 만났어야 한다. 그래서 적게 나온다.',
  ]) console.log(`  - ${line}`)
}

if (import.meta.filename === process.argv[1]) main()
