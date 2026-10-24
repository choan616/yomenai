// 상습 표현이 「벗어났다」고 볼 기준 후보를 실측으로 비교한다 (D3, 2026-10-24).
//
// 홈에 「벗어난 표현 N개」처럼 늘기만 하는 수를 두려면(S2) 한 번 센 표현이 다시 무너지지 않아야 한다.
// 이 스크립트는 기준 후보마다 벗어난 수, 벗어남 뒤 오답률, 무너진 비율, 주별 증가를 낸다. 결정은 사람이 한다.
//
// 미래 정보 금지 — 상습 여부와 벗어남은 **그 시점까지의 기록으로만** 판정한다.
// 날 경계 — 같은 날 재출제가 많아 섞이면 값이 왜곡되므로 한국 표준시(UTC+9) 달력 날로 따로 센다.
//
// 입력 — data/events/*.json (audit-plateau.ts 와 같다). 같은 id 는 한 번만 센다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareEvents, type LearningEvent, type ReviewEvent } from '../src/core/types.ts'
import { CHRONIC_WRONG } from './audit-plateau.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

const DAY_MS = 864e5
const KST_OFFSET_MS = 9 * 36e5
/** 무너짐 비율을 볼 때 추적 기간이 짧은 표현을 걸러내는 하한 — 벗어남 뒤 만남 수 */
export const FOLLOW_MIN = 3
/** 고정 지평 무너짐 — 벗어남 뒤 이 일수 안의 결과. 추적 기간이 기준마다 달라 생기는 차이를 없앤다 */
export const HORIZON_DAYS = 14

/** 한국 표준시 달력 날의 번호 */
export function dayOf(at: number): number {
  return Math.floor((at + KST_OFFSET_MS) / DAY_MS)
}

/** 마지막 오답 이후의 연속 정답 상태 — 기준 후보가 보는 입력 */
export interface StreakState {
  /** 연속 정답 횟수 */
  count: number
  /** 연속 정답이 걸친 서로 다른 날 수 */
  days: number
  /** 연속 정답의 첫 정답에서 지금까지 ms */
  spanMs: number
  /** 직전 만남(정오답 무관)에서 지금까지 ms */
  gapMs: number
}

export interface Criterion {
  id: string
  label: string
  test: (s: StreakState) => boolean
}

export const CRITERIA: readonly Criterion[] = [
  { id: 'K1', label: '연속 2회 정답 (지금 재대결)', test: (s) => s.count >= 2 },
  { id: 'K2', label: '연속 3회 정답', test: (s) => s.count >= 3 },
  { id: 'K3', label: '연속 정답이 2일에 걸침', test: (s) => s.days >= 2 },
  { id: 'K4', label: '연속 정답이 3일에 걸침', test: (s) => s.days >= 3 },
  { id: 'K5', label: '연속 2회+ 정답, 첫 정답에서 7일+', test: (s) => s.count >= 2 && s.spanMs >= 7 * DAY_MS },
  { id: 'K6', label: '직전 만남에서 7일+ 떨어진 정답', test: (s) => s.gapMs >= 7 * DAY_MS },
]

export interface Tally {
  n: number
  wrong: number
}

/** 정답을 낸 뒤 다음 만남의 결과 — 전체 / 날 경계를 넘은 것 / 같은 날 */
export interface PairTally {
  all: Tally
  crossDay: Tally
  sameDay: Tally
}

export interface Baselines {
  /** 그 시점에 누적 오답이 CHRONIC_WRONG 미만 */
  notChronic: PairTally
  /** 그 시점까지 오답이 한 번도 없음 */
  neverWrong: PairTally
  /** 그 시점까지 오답 1~(CHRONIC_WRONG-1)회 */
  fewWrong: PairTally
  /** 그 시점에 누적 오답이 CHRONIC_WRONG 이상 (미래 정보 없음) */
  chronicAtTime: PairTally
  /** 끝 기록 기준 상습 표현의 모든 정답 — audit-plateau 의 30.3% 와 같은 정의 */
  chronicFinal: PairTally
  everything: PairTally
}

export interface CriterionReport {
  id: string
  label: string
  escaped: number
  /** 벗어남 뒤 만남이 하나도 없는 표현 */
  noFollow: number
  /** 벗어남 뒤 첫 만남 */
  first: PairTally
  /** 벗어남 뒤 모든 만남 */
  afterAll: Tally
  /** 벗어남 뒤 만남 중 직전이 정답이고 날 경계를 넘은 것 — 기준선과 같은 조건 */
  afterCond: Tally
  /** 벗어남 뒤 오답 k회 이상인 표현 수 (k = 1, 2, 3) */
  collapsed: [number, number, number]
  /** 벗어남 뒤 만남이 FOLLOW_MIN 이상인 표현 수와 그 중 오답 k회 이상 */
  followed: number
  collapsedFollowed: [number, number, number]
  /** 지평(HORIZON_DAYS) 안 결과 — 데이터 끝까지 지평이 다 찬 벗어남만, 그 중 지평 안에 만남이 있었던 것 */
  horizon: { eligible: number; observed: number; wrong1: number; wrong2: number }
  /** 상습이 된 시점부터 벗어남까지 일수 (달력 날 차이) */
  daysFromChronic: number[]
  /** 마지막 오답부터 벗어남까지 일수 */
  daysFromLastWrong: number[]
  /** 벗어난 날의 주 번호별 신규 수 */
  weeklyNew: number[]
}

export interface EscapeReport {
  idioms: number
  chronic: number
  firstDay: number
  lastDay: number
  baselines: Baselines
  criteria: CriterionReport[]
  /** 주 번호별 새로 상습이 된 표현 수 */
  weeklyChronic: number[]
}

function emptyPair(): PairTally {
  return { all: { n: 0, wrong: 0 }, crossDay: { n: 0, wrong: 0 }, sameDay: { n: 0, wrong: 0 } }
}

function addPair(p: PairTally, wrong: boolean, cross: boolean): void {
  const parts = [p.all, cross ? p.crossDay : p.sameDay]
  for (const t of parts) {
    t.n++
    if (wrong) t.wrong++
  }
}

export function median(xs: readonly number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** 읽기 채점만, 삭제 제외, 같은 id 한 번, 시간순 */
export function readingReviews(events: readonly LearningEvent[]): ReviewEvent[] {
  const seen = new Map<string, ReviewEvent>()
  for (const e of events) {
    if (e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null) seen.set(e.id, e)
  }
  return [...seen.values()].sort(compareEvents)
}

interface Escape {
  /** 벗어난 만남의 목록 안 위치 */
  idx: number
  /** 상습이 된(CHRONIC_WRONG 번째 오답) 만남의 위치 */
  chronicIdx: number
  lastWrongIdx: number
}

/** 한 표현의 기록에서 기준마다 처음 벗어난 자리를 찾는다. 그 시점까지의 기록만 쓴다 */
export function findEscapes(list: readonly ReviewEvent[]): (Escape | null)[] {
  const found: (Escape | null)[] = CRITERIA.map(() => null)
  let wrongs = 0
  let chronicIdx = -1
  let lastWrongIdx = -1
  let count = 0
  let firstAt = 0
  const days = new Set<number>()
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!
    if (!e.correct) {
      wrongs++
      if (wrongs === CHRONIC_WRONG) chronicIdx = i
      lastWrongIdx = i
      count = 0
      days.clear()
      continue
    }
    if (count === 0) firstAt = e.at
    count++
    days.add(dayOf(e.at))
    if (wrongs < CHRONIC_WRONG) continue
    const state: StreakState = {
      count,
      days: days.size,
      spanMs: e.at - firstAt,
      gapMs: i > 0 ? e.at - list[i - 1]!.at : 0,
    }
    CRITERIA.forEach((c, k) => {
      if (found[k] === null && c.test(state)) found[k] = { idx: i, chronicIdx, lastWrongIdx }
    })
  }
  return found
}

export function escapeReport(events: readonly LearningEvent[]): EscapeReport | null {
  const reads = readingReviews(events)
  if (reads.length === 0) return null
  const byIdiom = new Map<string, ReviewEvent[]>()
  for (const e of reads) {
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
  }
  const firstDay = dayOf(reads[0]!.at)
  const lastAt = reads[reads.length - 1]!.at
  const lastDay = dayOf(lastAt)
  const weekOf = (at: number): number => Math.floor((dayOf(at) - firstDay) / 7)
  const weeks = weekOf(reads[reads.length - 1]!.at) + 1

  const baselines: Baselines = {
    notChronic: emptyPair(),
    neverWrong: emptyPair(),
    fewWrong: emptyPair(),
    chronicAtTime: emptyPair(),
    chronicFinal: emptyPair(),
    everything: emptyPair(),
  }
  const reports: CriterionReport[] = CRITERIA.map((c) => ({
    id: c.id,
    label: c.label,
    escaped: 0,
    noFollow: 0,
    first: emptyPair(),
    afterAll: { n: 0, wrong: 0 },
    afterCond: { n: 0, wrong: 0 },
    collapsed: [0, 0, 0],
    followed: 0,
    collapsedFollowed: [0, 0, 0],
    horizon: { eligible: 0, observed: 0, wrong1: 0, wrong2: 0 },
    daysFromChronic: [],
    daysFromLastWrong: [],
    weeklyNew: new Array<number>(weeks).fill(0),
  }))
  const weeklyChronic = new Array<number>(weeks).fill(0)
  let chronic = 0

  for (const list of byIdiom.values()) {
    const finalChronic = list.filter((e) => !e.correct).length >= CHRONIC_WRONG
    let wrongs = 0
    for (let i = 0; i < list.length; i++) {
      const e = list[i]!
      if (!e.correct) {
        wrongs++
        if (wrongs === CHRONIC_WRONG) weeklyChronic[weekOf(e.at)]!++
        continue
      }
      const next = list[i + 1]
      if (!next) continue
      const wrong = !next.correct
      const cross = dayOf(next.at) !== dayOf(e.at)
      addPair(baselines.everything, wrong, cross)
      if (wrongs < CHRONIC_WRONG) addPair(baselines.notChronic, wrong, cross)
      if (wrongs === 0) addPair(baselines.neverWrong, wrong, cross)
      else if (wrongs < CHRONIC_WRONG) addPair(baselines.fewWrong, wrong, cross)
      else addPair(baselines.chronicAtTime, wrong, cross)
      if (finalChronic) addPair(baselines.chronicFinal, wrong, cross)
    }
    if (!finalChronic) continue
    chronic++

    findEscapes(list).forEach((esc, k) => {
      if (!esc) return
      const r = reports[k]!
      const at = list[esc.idx]!.at
      r.escaped++
      r.weeklyNew[weekOf(at)]!++
      r.daysFromChronic.push(dayOf(at) - dayOf(list[esc.chronicIdx]!.at))
      r.daysFromLastWrong.push(dayOf(at) - dayOf(list[esc.lastWrongIdx]!.at))
      const after = list.slice(esc.idx + 1)
      if (lastAt - at >= HORIZON_DAYS * DAY_MS) {
        r.horizon.eligible++
        const inWindow = after.filter((e) => e.at - at <= HORIZON_DAYS * DAY_MS)
        if (inWindow.length > 0) {
          const w = inWindow.filter((e) => !e.correct).length
          r.horizon.observed++
          if (w >= 1) r.horizon.wrong1++
          if (w >= 2) r.horizon.wrong2++
        }
      }
      if (after.length === 0) {
        r.noFollow++
        return
      }
      addPair(r.first, !after[0]!.correct, dayOf(after[0]!.at) !== dayOf(at))
      let prev = list[esc.idx]!
      let wrongAfter = 0
      for (const e of after) {
        r.afterAll.n++
        if (!e.correct) {
          r.afterAll.wrong++
          wrongAfter++
        }
        if (prev.correct && dayOf(e.at) !== dayOf(prev.at)) {
          r.afterCond.n++
          if (!e.correct) r.afterCond.wrong++
        }
        prev = e
      }
      for (let m = 0; m < 3; m++) {
        if (wrongAfter >= m + 1) r.collapsed[m]!++
      }
      if (after.length >= FOLLOW_MIN) {
        r.followed++
        for (let m = 0; m < 3; m++) {
          if (wrongAfter >= m + 1) r.collapsedFollowed[m]!++
        }
      }
    })
  }

  return { idioms: byIdiom.size, chronic, firstDay, lastDay, baselines, criteria: reports, weeklyChronic }
}

// ---- 출력 ----

function pct(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'
}

function tally(t: Tally): string {
  return `${pct(t.wrong, t.n)} (${t.wrong}/${t.n})`
}

/** 비율의 95% Wilson 구간(%) — 표본이 작은 칸을 읽을 때 쓴다 */
export function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null
  const z = 1.96
  const p = k / n
  const d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return [(c - h) * 100, (c + h) * 100]
}

function tallyCi(t: Tally): string {
  const ci = wilson(t.wrong, t.n)
  return ci ? `${tally(t)} [${ci[0].toFixed(0)}~${ci[1].toFixed(0)}]` : tally(t)
}

function fmtDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10)
}

/** 끝까지 찬 주만 — 마지막 날이 주의 마지막 칸(6)이면 찬 주 */
export function completeWeeks(firstDay: number, lastDay: number): number {
  return Math.floor((lastDay - firstDay + 1) / 7)
}

function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function printReport(r: EscapeReport): void {
  const { baselines: b } = r
  const rows = (name: string, p: PairTally): void =>
    console.log(`| ${name} | ${tally(p.all)} | ${tally(p.crossDay)} | ${tally(p.sameDay)} |`)

  console.log('=== 상습 표현이 벗어난 기준 실측 (D3) ===')
  console.log(`기간 ${fmtDay(r.firstDay)} ~ ${fmtDay(r.lastDay)} (KST), 표현 ${r.idioms}개, 상습(누적 오답 ${CHRONIC_WRONG}회+) ${r.chronic}개`)
  console.log('')
  console.log('## 기준선 — 정답을 낸 다음 만남의 오답률 (상습 여부는 그 시점까지 기록으로)')
  console.log('| 대상 | 전체 | 날 경계 넘음 | 같은 날 |')
  console.log('|---|---|---|---|')
  rows('(a) 상습이 아닌 표현', b.notChronic)
  rows('  (a1) 오답 한 번도 없음', b.neverWrong)
  rows(`  (a2) 오답 1~${CHRONIC_WRONG - 1}회`, b.fewWrong)
  rows('(b) 상습 표현 (그 시점 기준)', b.chronicAtTime)
  rows('(b\') 끝 기록 기준 상습 표현 (audit-plateau 정의)', b.chronicFinal)
  rows('(c) 전체 표현', b.everything)

  console.log('')
  console.log('## 기준별 — 벗어남 뒤')
  console.log(
    '| 기준 | 벗어난 수 (상습 대비) | 뒤 첫 만남 오답률 (전체) | 뒤 첫 만남 (날 경계 넘음) | 이후 전체 오답률 | 이후 (직전 정답·날 경계 넘음) | 무너짐 오답≥2 (전체) | 오답≥2 (뒤 만남 ≥' + FOLLOW_MIN + ') | 오답≥1 / ≥3 (뒤 만남 ≥' + FOLLOW_MIN + ') |',
  )
  console.log('|---|---|---|---|---|---|---|---|---|')
  for (const c of r.criteria) {
    console.log(
      `| ${c.id} ${c.label} | ${c.escaped} (${pct(c.escaped, r.chronic)}) | ${tally(c.first.all)} | ${tallyCi(c.first.crossDay)} | ${tally(c.afterAll)} | ${tally(c.afterCond)} | ${pct(c.collapsed[1], c.escaped)} (${c.collapsed[1]}/${c.escaped}) | ${pct(c.collapsedFollowed[1], c.followed)} (${c.collapsedFollowed[1]}/${c.followed}) | ${pct(c.collapsedFollowed[0], c.followed)} / ${pct(c.collapsedFollowed[2], c.followed)} |`,
    )
  }

  console.log('')
  console.log(`## 고정 지평 무너짐 — 벗어남 뒤 ${HORIZON_DAYS}일 안 (데이터 끝까지 ${HORIZON_DAYS}일이 다 찬 벗어남만)`)
  console.log('| 기준 | 대상 | 지평 안에 만남 있음 | 오답≥1 | 오답≥2 |')
  console.log('|---|---|---|---|---|')
  for (const c of r.criteria) {
    const h = c.horizon
    console.log(
      `| ${c.id} | ${h.eligible} | ${h.observed} (${pct(h.observed, h.eligible)}) | ${pct(h.wrong1, h.observed)} (${h.wrong1}/${h.observed}) | ${pct(h.wrong2, h.observed)} (${h.wrong2}/${h.observed}) |`,
    )
  }

  const full = completeWeeks(r.firstDay, r.lastDay)
  console.log('')
  console.log(`## 증가 속도와 걸린 일수 (기간 ${r.lastDay - r.firstDay + 1}일, 찬 주 ${full}개)`)
  console.log('| 기준 | 벗어남 뒤 만남 없음 | 주당 신규 (찬 주 전체 평균) | 주당 신규 (마지막 4주 평균) | 마지막 4주 최소~최대 | 상습이 된 뒤 일수 중앙값 | 마지막 오답 뒤 일수 중앙값 |')
  console.log('|---|---|---|---|---|---|---|')
  for (const c of r.criteria) {
    const w = c.weeklyNew.slice(0, full)
    const last4 = w.slice(-4)
    console.log(
      `| ${c.id} | ${c.noFollow} | ${mean(w).toFixed(1)} | ${mean(last4).toFixed(1)} | ${last4.length ? `${Math.min(...last4)}~${Math.max(...last4)}` : '—'} | ${median(c.daysFromChronic) ?? '—'} | ${median(c.daysFromLastWrong) ?? '—'} |`,
    )
  }

  console.log('')
  console.log('## 주별 누적 벗어난 수 (주 1 = 첫 기록 날부터 7일, 마지막 주는 ' + ((r.lastDay - r.firstDay + 1) % 7 === 0 ? '찬 주' : '덜 찬 주') + ')')
  console.log('| 주 | 시작일 | 새 상습 (누적) | ' + r.criteria.map((c) => c.id).join(' | ') + ' |')
  console.log('|---|---|---|' + r.criteria.map(() => '---').join('|') + '|')
  const cum = r.criteria.map(() => 0)
  let cumChronic = 0
  r.weeklyChronic.forEach((wc, w) => {
    cumChronic += wc
    const cells = r.criteria.map((c, k) => {
      cum[k]! += c.weeklyNew[w]!
      return `${cum[k]} (+${c.weeklyNew[w]})`
    })
    console.log(`| ${w + 1} | ${fmtDay(r.firstDay + w * 7)} | ${cumChronic} (+${wc}) | ${cells.join(' | ')} |`)
  })
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다. 백업 JSON 을 넣는다 (--dir= 로 다른 경로 지정 가능).`)
    process.exit(1)
  }
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))
  const seen = new Map<string, LearningEvent>()
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`${f} 가 이벤트 배열이 아니다. 건너뛴다.`)
      continue
    }
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }
  const report = escapeReport([...seen.values()])
  if (!report) {
    console.error('읽기 채점 이벤트가 없다.')
    process.exit(1)
  }
  printReport(report)
}

if (import.meta.filename === process.argv[1]) main()
