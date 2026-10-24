// 「상습 표현 몫 상한」(PLAN §11 D2)을 두면 창 정답률·적체가 어떻게 되는지 기록으로 어림하는 시뮬레이션.
//
// 구현이 아니라 판단 재료다 — 결정은 사람이 한다. 모델 가정과 한계는 실행 출력 끝에도 적는다.
// 입력 — data/events/*.json (audit-plateau 와 같다). 같은 id 는 한 번만 센다.
//
// 모델 (단순화)
//  1. 날짜(KST)별 실제 읽기 채점을 상습/나머지로 가른다. 상습 = 그 날 **이전** 기록의 누적 오답 3회+.
//  2. 상한 c: 그날 학습량 T(실제 채점 수)는 그대로. 상습 채점은 최대 floor(c×T). 초과 수요는 FIFO 큐로
//     이월되고 다음 날 상습 수요에 더해진다. 빈 자리는 나머지 표현으로 채운다.
//  3. 정답률은 관측값으로 근사 — 직전 14일 풀링 정답률(상습·나머지 각각). 지연 후 정답률 변화는 모델 밖.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareEvents, type LearningEvent, type ReviewEvent } from '../src/core/types.ts'
import { plateauProfile } from './audit-plateau.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

/** audit-plateau 의 CHRONIC_WRONG 과 같다 */
export const CHRONIC_WRONG = 3
const DAY_MS = 864e5
const KST_OFFSET_MS = 9 * 36e5
/** 정답률 이동 평균 창 (직전 N일) */
export const RATE_DAYS = 14
/** 최소 표본이 이보다 적으면 그 날까지 전체 누적으로 대신한다 */
const MIN_RATE_N = 20
/** 평가 창 일수 */
export const WINDOW_DAYS = 7

/** KST 달력 날짜의 일련번호 (1970-01-01 KST = 0) */
export function kstDay(at: number): number {
  return Math.floor((at + KST_OFFSET_MS) / DAY_MS)
}

export interface DayRow {
  day: number
  /** 실제 읽기 채점 수 */
  total: number
  /** 그 날 이전 기록으로 상습인 표현의 채점 수·정답 수 */
  chronic: number
  chronicOk: number
  restOk: number
  /** 그 날 시작 시점의 상습 표현 수 */
  chronicSet: number
}

/** 읽기 채점을 날짜별로 모으고 상습/나머지를 가른다 (그 날 이전 누적 오답으로만 판정) */
export function dailyRows(events: readonly LearningEvent[]): DayRow[] {
  const reads = events
    .filter((e): e is ReviewEvent => e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null)
    .sort(compareEvents)
  const wrongs = new Map<string, number>()
  const rows: DayRow[] = []
  let cur: DayRow | null = null
  let chronicSet = 0
  /** 당일 안에서 늘어난 오답은 하루가 끝나야 반영한다 */
  let pending: string[] = []
  const flush = () => {
    for (const id of pending) {
      const before = wrongs.get(id) ?? 0
      wrongs.set(id, before + 1)
      if (before + 1 === CHRONIC_WRONG) chronicSet++
    }
    pending = []
  }
  for (const e of reads) {
    const d = kstDay(e.at)
    if (!cur || cur.day !== d) {
      flush()
      cur = { day: d, total: 0, chronic: 0, chronicOk: 0, restOk: 0, chronicSet }
      rows.push(cur)
    }
    const isChronic = (wrongs.get(e.idiomId) ?? 0) >= CHRONIC_WRONG
    cur.total++
    if (isChronic) {
      cur.chronic++
      if (e.correct) cur.chronicOk++
    } else if (e.correct) cur.restOk++
    if (!e.correct) pending.push(e.idiomId)
  }
  return rows
}

export interface Rates {
  chronic: number
  rest: number
}

/** rows[i] 날 직전 RATE_DAYS 일(달력 기준)의 풀링 정답률. 표본이 모자라면 그 날까지 전체 누적 */
export function ratesBefore(rows: readonly DayRow[], i: number): Rates {
  const pool = (from: number) => {
    let cn = 0
    let cok = 0
    let rn = 0
    let rok = 0
    for (let j = 0; j < i; j++) {
      const r = rows[j]!
      if (r.day < from) continue
      cn += r.chronic
      cok += r.chronicOk
      rn += r.total - r.chronic
      rok += r.restOk
    }
    return { cn, cok, rn, rok }
  }
  const recent = pool(rows[i]!.day - RATE_DAYS)
  const all = recent.cn >= MIN_RATE_N && recent.rn >= MIN_RATE_N ? recent : pool(-Infinity)
  return {
    chronic: all.cn > 0 ? all.cok / all.cn : 0,
    rest: all.rn > 0 ? all.rok / all.rn : 0,
  }
}

export interface CapResult {
  /** 평가 창(마지막 WINDOW_DAYS 달력일)의 채점 수와 추정 정답 수 */
  windowTotal: number
  windowExpectedOk: number
  windowChronicServed: number
  /** 날마다 이월 적체(그 날 끝)와 그 날짜 */
  backlog: { day: number; n: number }[]
  /** 서비스된 상습 채점의 지연 일수 합과 건수 (전 기간 / 창) */
  delaySum: number
  served: number
  windowDelaySum: number
  windowServed: number
  /** 끝까지 못 푼 적체의 나이 합 (마지막 날 기준) */
  leftoverAgeSum: number
  leftover: number
}

/** cap = null 이면 상한 없음. 그날 학습량은 그대로, 상습 서비스는 floor(cap×T) 까지 */
export function simulateCap(rows: readonly DayRow[], cap: number | null): CapResult {
  const queue: { day: number; n: number }[] = []
  const res: CapResult = {
    windowTotal: 0,
    windowExpectedOk: 0,
    windowChronicServed: 0,
    backlog: [],
    delaySum: 0,
    served: 0,
    windowDelaySum: 0,
    windowServed: 0,
    leftoverAgeSum: 0,
    leftover: 0,
  }
  if (rows.length === 0) return res
  const last = rows[rows.length - 1]!.day
  const windowFrom = last - WINDOW_DAYS + 1
  rows.forEach((r, i) => {
    if (r.chronic > 0) queue.push({ day: r.day, n: r.chronic })
    const room = cap === null ? Infinity : Math.floor(cap * r.total)
    let left = Math.min(room, r.total)
    let served = 0
    let delay = 0
    while (left > 0 && queue.length > 0) {
      const head = queue[0]!
      const take = Math.min(head.n, left)
      served += take
      delay += take * (r.day - head.day)
      left -= take
      head.n -= take
      if (head.n === 0) queue.shift()
    }
    res.delaySum += delay
    res.served += served
    res.backlog.push({ day: r.day, n: queue.reduce((s, q) => s + q.n, 0) })
    if (r.day >= windowFrom) {
      const rate = ratesBefore(rows, i)
      res.windowTotal += r.total
      res.windowChronicServed += served
      res.windowExpectedOk += served * rate.chronic + (r.total - served) * rate.rest
      res.windowDelaySum += delay
      res.windowServed += served
    }
  })
  for (const q of queue) {
    res.leftover += q.n
    res.leftoverAgeSum += q.n * (last - q.day)
  }
  return res
}

export interface Flow {
  /** 상습 수요(실제 상습 채점) 일평균 */
  demandPerDay: number
  /** 학습량 일평균 */
  totalPerDay: number
  days: number
}

/** 최근 n 개 학습일의 상습 수요·학습량 일평균. 상한 용량 = c × totalPerDay */
export function recentFlow(rows: readonly DayRow[], n: number): Flow {
  const tail = rows.slice(-n)
  const days = tail.length
  const sum = (f: (r: DayRow) => number) => tail.reduce((s, r) => s + f(r), 0)
  return {
    demandPerDay: days > 0 ? sum((r) => r.chronic) / days : 0,
    totalPerDay: days > 0 ? sum((r) => r.total) / days : 0,
    days,
  }
}

export interface IntervalStats {
  n: number
  median: number
  /** 간격(일) 구간별 건수: 0, 1, 2, 3-4, 5-7, 8-14, 15+ */
  buckets: number[]
}

export const INTERVAL_LABELS = ['같은 날', '1일', '2일', '3-4일', '5-7일', '8-14일', '15일+']

function bucketOf(gap: number): number {
  if (gap <= 2) return gap
  if (gap <= 4) return 3
  if (gap <= 7) return 4
  if (gap <= 14) return 5
  return 6
}

/**
 * 같은 표현의 연속한 두 읽기 채점 사이 달력일 간격 분포.
 * chronic=true: 앞 채점 직후 누적 오답이 3회 이상인 표현의 간격, false: 그 외.
 */
export function reviewIntervals(events: readonly LearningEvent[], chronic: boolean): IntervalStats {
  const reads = events
    .filter((e): e is ReviewEvent => e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null)
    .sort(compareEvents)
  const state = new Map<string, { wrong: number; day: number }>()
  const gaps: number[] = []
  for (const e of reads) {
    const d = kstDay(e.at)
    const s = state.get(e.idiomId)
    if (s && (s.wrong >= CHRONIC_WRONG) === chronic) gaps.push(d - s.day)
    state.set(e.idiomId, { wrong: (s?.wrong ?? 0) + (e.correct ? 0 : 1), day: d })
  }
  const buckets = new Array<number>(INTERVAL_LABELS.length).fill(0)
  for (const g of gaps) buckets[bucketOf(g)]!++
  gaps.sort((a, b) => a - b)
  return { n: gaps.length, median: gaps.length > 0 ? gaps[Math.floor(gaps.length / 2)]! : NaN, buckets }
}

export interface ShareByVolume {
  /** 학습량 하위 1/3 날들과 상위 1/3 날들의 학습량 범위·일수·상습 몫(풀링) */
  low: { days: number; minTotal: number; maxTotal: number; share: number }
  high: { days: number; minTotal: number; maxTotal: number; share: number }
}

/** 학습량 하위/상위 1/3 날의 상습 몫. minChronicSet 미만인 초기 날은 뺀다 */
export function shareByVolume(rows: readonly DayRow[], minChronicSet: number): ShareByVolume | null {
  const use = rows.filter((r) => r.chronicSet >= minChronicSet).sort((a, b) => a.total - b.total)
  const k = Math.floor(use.length / 3)
  if (k === 0) return null
  const summarize = (part: DayRow[]) => ({
    days: part.length,
    minTotal: part[0]!.total,
    maxTotal: part[part.length - 1]!.total,
    share: part.reduce((s, r) => s + r.chronic, 0) / part.reduce((s, r) => s + r.total, 0),
  })
  return { low: summarize(use.slice(0, k)), high: summarize(use.slice(use.length - k)) }
}

function pct(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'
}

const CAPS: { label: string; cap: number | null }[] = [
  { label: '없음', cap: null },
  { label: '1/2', cap: 1 / 2 },
  { label: '2/5 (참고)', cap: 2 / 5 },
  { label: '1/3', cap: 1 / 3 },
  { label: '1/4', cap: 1 / 4 },
]

function trend(backlog: { n: number }[]): string {
  const up = backlog.filter((b, i) => i > 0 && b.n > backlog[i - 1]!.n).length
  const down = backlog.filter((b, i) => i > 0 && b.n < backlog[i - 1]!.n).length
  return `증가 ${up}일 / 감소 ${down}일 / 그대로 ${Math.max(backlog.length - 1 - up - down, 0)}일`
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다. 백업 JSON 을 넣는다 (--dir= 로 다른 경로 지정 가능).`)
    process.exit(1)
  }
  const seen = new Map<string, LearningEvent>()
  for (const f of readdirSync(EVENTS_DIR).filter((x) => x.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`${f} 가 이벤트 배열이 아니다. 건너뛴다.`)
      continue
    }
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }
  const events = [...seen.values()]
  const rows = dailyRows(events)
  if (rows.length === 0) {
    console.error('읽기 채점 이벤트가 없다.')
    process.exit(1)
  }

  const last = rows[rows.length - 1]!.day
  const winRows = rows.filter((r) => r.day > last - WINDOW_DAYS)
  const winTotal = winRows.reduce((s, r) => s + r.total, 0)
  const winChronic = winRows.reduce((s, r) => s + r.chronic, 0)
  const winOk = winRows.reduce((s, r) => s + r.chronicOk + r.restOk, 0)
  const dayStr = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10)

  console.log('=== 상습 표현 몫 상한 시뮬레이션 (PLAN §11 D2) ===')
  console.log(`학습일 ${rows.length}일 (${dayStr(rows[0]!.day)} ~ ${dayStr(last)}, KST), 읽기 채점 ${rows.reduce((s, r) => s + r.total, 0)}건`)
  console.log(`상습 = 그 날 이전 누적 오답 ${CHRONIC_WRONG}회+. 정답률 = 직전 ${RATE_DAYS}일 풀링(표본 <${MIN_RATE_N} 이면 누적)`)
  console.log('')
  console.log(`[관측] 마지막 ${WINDOW_DAYS}일(달력, ${dayStr(last - WINDOW_DAYS + 1)}~) 실제: 채점 ${winTotal}, 정답률 ${pct(winOk, winTotal)}, 상습 몫 ${pct(winChronic, winTotal)}`)
  const hind = plateauProfile(events)
  if (hind) {
    const { chronic: hc, rest: hr } = hind.window
    console.log(
      `[참고] 사후 판정(audit-plateau, 전 기록으로 상습 분류 = 미래 정보 포함, 168시간 창): 상습 몫 ${pct(hc.n, hc.n + hr.n)}, 상습 정답률 ${pct(hc.ok, hc.n)}, 나머지 ${pct(hr.ok, hr.n)}`,
    )
  }
  const lr = ratesBefore(rows, rows.length - 1)
  console.log(`[관측] 마지막 날 직전 ${RATE_DAYS}일 정답률 — 상습(그 시점 판정) ${(lr.chronic * 100).toFixed(1)}%, 나머지 ${(lr.rest * 100).toFixed(1)}%`)
  console.log(`  상습 몫이 1%p 줄면 창 정답률은 약 ${((lr.rest - lr.chronic) * 1).toFixed(2)}%p 오른다 (정답률 차 × 몫 변화)`)

  console.log('')
  console.log('--- 최근 학습일 추이 (날짜, 학습량, 상습 채점, 상습 몫, 상습 표현 수) ---')
  for (const r of rows.slice(-14)) {
    console.log(`  ${dayStr(r.day)}  T=${String(r.total).padStart(4)}  상습=${String(r.chronic).padStart(4)}  ${pct(r.chronic, r.total).padStart(6)}  표현 ${r.chronicSet}`)
  }

  console.log('')
  console.log('--- 상한별 시뮬레이션 ---')
  console.log('상한        | 창 추정 정답률 | 창 상습 몫 | 마지막 날 적체 | 적체 추이(전 기간) | 평균 지연(전 기간/창)')
  const results = CAPS.map((c) => ({ ...c, res: simulateCap(rows, c.cap) }))
  for (const { label, res } of results) {
    const lastBacklog = res.backlog[res.backlog.length - 1]!.n
    const delayAll = res.served > 0 ? (res.delaySum / res.served).toFixed(2) : '—'
    const delayWin = res.windowServed > 0 ? (res.windowDelaySum / res.windowServed).toFixed(2) : '—'
    console.log(
      `${label.padEnd(10)} | ${pct(res.windowExpectedOk, res.windowTotal).padStart(14)} | ${pct(res.windowChronicServed, res.windowTotal).padStart(10)} | ${String(lastBacklog).padStart(14)} | ${trend(res.backlog)} | ${delayAll} / ${delayWin}일`,
    )
  }
  console.log('  (지연 평균은 서비스된 상습 채점만. 끝까지 못 푼 적체는 아래 나이로 따로 본다)')
  for (const { label, res } of results) {
    if (res.leftover > 0)
      console.log(`  ${label}: 끝까지 못 푼 ${res.leftover}건, 평균 나이 ${(res.leftoverAgeSum / res.leftover).toFixed(1)}일`)
  }

  console.log('')
  console.log('--- 적체 주간 표본 (마지막 날부터 7일 간격으로 거슬러) ---')
  for (const { label, res } of results.slice(1)) {
    const pts: string[] = []
    for (let i = res.backlog.length - 1; i >= 0; i -= 7) pts.unshift(String(res.backlog[i]!.n))
    console.log(`  ${label.padEnd(10)}: ${pts.join(' → ')}`)
  }

  console.log('')
  console.log('--- 수요 vs 용량 (일평균). 수요 = 실제 상습 채점, 용량 = 상한 × 학습량 ---')
  for (const n of [rows.length, 28, 14, 7]) {
    const f = recentFlow(rows, n)
    const line = CAPS.slice(1)
      .map(({ label, cap }) => {
        const capDay = cap! * f.totalPerDay
        return `${label} 용량 ${capDay.toFixed(1)}(${f.demandPerDay <= capDay ? '수렴' : '발산'})`
      })
      .join(', ')
    console.log(`  최근 ${String(f.days).padStart(2)}학습일: 학습량 ${f.totalPerDay.toFixed(1)}, 상습 수요 ${f.demandPerDay.toFixed(1)} (몫 ${pct(f.demandPerDay, f.totalPerDay)}) → ${line}`)
  }
  console.log('  수요 ≤ 용량이면 적체가 쌓이다 비고, 수요 > 용량이면 하루 (수요−용량) 만큼 계속 쌓인다.')

  console.log('')
  console.log('=== 관측: 상습 표현의 복습 간격 ===')
  const iv = reviewIntervals(events, true)
  const ivRest = reviewIntervals(events, false)
  console.log(`간격 = 같은 표현의 연속한 두 읽기 채점 사이 달력일 (앞 채점 직후 상습이면 상습 간격)`)
  console.log(`구간      | 상습 ${iv.n}건 (중앙값 ${iv.median}일) | 나머지 ${ivRest.n}건 (중앙값 ${ivRest.median}일)`)
  INTERVAL_LABELS.forEach((l, i) => {
    console.log(`${l.padEnd(8)} | ${pct(iv.buckets[i]!, iv.n).padStart(8)} | ${pct(ivRest.buckets[i]!, ivRest.n).padStart(8)}`)
  })

  console.log('')
  console.log('=== 관측: 학습량과 상습 몫 ===')
  for (const min of [0, 100, 300]) {
    const s = shareByVolume(rows, min)
    if (!s) {
      console.log(`상습 표현 ${min}개+ 날: 표본 부족`)
      continue
    }
    console.log(
      `상습 표현 ${String(min).padStart(3)}개+ 날: 하위 1/3 (${s.low.days}일, T ${s.low.minTotal}~${s.low.maxTotal}) 몫 ${(s.low.share * 100).toFixed(1)}%  |  상위 1/3 (${s.high.days}일, T ${s.high.minTotal}~${s.high.maxTotal}) 몫 ${(s.high.share * 100).toFixed(1)}%`,
    )
  }

  console.log('')
  console.log('=== 모델 한계 ===')
  console.log('- 상습 수요는 실제 기록 그대로(외생). 상한으로 복습이 밀리면 실제 FSRS 에서는 기한 이동·간격 변화로 수요가 달라진다.')
  console.log('- 지연된 카드의 정답률 하락(망각)은 모델 밖이다. 추정 정답률은 상한에 유리하게 낙관적이다.')
  console.log('- 빈 자리를 채우는 「나머지」는 실제로 기한이 안 된 카드일 수 있다. 나머지 정답률을 그대로 쓴다.')
  console.log('- 정답률은 직전 14일 풀링 평균이다. 개별 표현의 난이도 차이는 없다. 한 사람, 소수의 학습일.')
}

if (import.meta.filename === process.argv[1]) main()
