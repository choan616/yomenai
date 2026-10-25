// 며칠 쉬고 돌아온 날의 첫 세션을 두 정책으로 고르면 어떻게 다른지 기록으로 어림하는 시뮬레이션 (PLAN §11 S1)
//
// 구현이 아니라 판단 재료다 — 결정은 사람이 한다. 모델 가정과 한계는 실행 출력 끝에도 적는다.
// 입력 — data/events/*.json (같은 id 한 번, deletedAt 제외). 카드 상태는 src/core/replay.ts 의 replay 로 만든다.
//
// 정책 (복습 기한이 지난 카드 풀에서 SESSION 장)
//  P0 기한 초과량 순 — select.ts 의 byOverdue 와 같은 정렬(초과 큰 순 → idiomId → 읽기 먼저).
//     main 이 selectSession 과 뽑은 집합이 같은지 매번 대조한다.
//  P1 FSRS 기억 확률(retrievability) 높은 순 — 같으면 초과가 작은 쪽, 그다음 P0 와 같은 타이브레이크.
//
// 모델 (단순화) — 뺀 것: 신규 도입, 담은 것(star) 몫, 훈독 정원(kunShare), 7:3 교정/확장 배분,
//  읽기-뜻 자리 맞바꿈(readingFirst), 모드(correction)에서 뜻 카드를 안 내는 규칙. 풀은 state.cards 의
//  기한 지난 읽기·뜻 카드 전부다.
//  1. 시점 T = 기록 안 KST 날짜의 끝. T 까지의 이벤트로 replay, 공백 g 일 뒤 now = T + g 일.
//  2. 기억 확률은 ts-fsrs 의 get_retrievability 와 같은 식(경과 일수 = 마지막 복습 뒤 *내림* 일수).
//  3. 소진 모의는 첫 세션 풀(S0)만 다룬다. 고른 카드는 처리돼 풀에서 빠지고 결과(정답/오답)로 인한 재출제는
//     세지 않는다 — 기대값 비교다. 세션은 하루 간격, 2회차부터는 P0. S0 의 카드는 이후 어느 시점의 신규
//     도래분보다 항상 초과가 크므로(도래분은 now_k 기준 초과 < k일, S0 는 ≥ k일) 신규 도래분을 넣어도
//     S0 의 처리 순서는 안 바뀐다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fsrs, State, type Card } from 'ts-fsrs'
import { replay, type ReplayState } from '../src/core/replay.ts'
import { applyGrade, FSRS_PARAMS, isDue, newCard } from '../src/core/scheduler.ts'
import { selectSession } from '../src/core/select.ts'
import {
  cardKey,
  compareEvents,
  type CardType,
  type LearningEvent,
  type ReviewEvent,
} from '../src/core/types.ts'

export const DAY_MS = 864e5
const KST_OFFSET_MS = 9 * 36e5
/** 세션 한 번에 내는 카드 수 */
export const SESSION = 20
/** 공백(일) */
export const GAPS = [0, 3, 5, 10, 14]
/** 캘리브레이션 구간 수 (0.1 간격) */
export const BUCKETS = 10
/** 보정 표의 한 칸이 이 수보다 적으면 덜 구체적인 표로 물러난다 */
export const MIN_BUCKET_N = 30
/** 시점 T 의 첫 날 (KST) */
const FIRST_T_DAY = '2026-09-20'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

/** KST 달력 날짜의 일련번호 (1970-01-01 KST = 0) */
export function kstDay(at: number): number {
  return Math.floor((at + KST_OFFSET_MS) / DAY_MS)
}

/** KST 달력일 day 의 마지막 ms */
export function endOfKstDay(day: number): number {
  return (day + 1) * DAY_MS - KST_OFFSET_MS - 1
}

const scheduler = fsrs(FSRS_PARAMS)

/** 마지막 복습 뒤 지난 *내림* 일수. get_retrievability 의 t 와 같다 */
export function elapsedDays(card: Card, now: number): number {
  if (card.last_review === undefined) return 0
  return Math.max(Math.floor((now - card.last_review.getTime()) / DAY_MS), 0)
}

/**
 * FSRS 기억 확률. `get_retrievability` 와 같은 식(`forgetting_curve`)을 직접 부른다 —
 * 소진 모의가 수백만 번 부르는데 get_retrievability 는 호출마다 카드를 복사해 느리다.
 * 같은 값임은 테스트가 대조한다.
 */
export function retrievability(card: Card, now: number): number {
  if (card.state === State.New || card.last_review === undefined) return 0
  return scheduler.forgetting_curve(elapsedDays(card, now), +card.stability.toFixed(8))
}

// ───────────────────────── 정책 ─────────────────────────

export type Policy = 'overdue' | 'retrievability'
export const POLICIES: Policy[] = ['overdue', 'retrievability']
export const POLICY_LABEL: Record<Policy, string> = { overdue: 'P0', retrievability: 'P1' }

export interface Rankable {
  idiomId: string
  cardType: CardType
  /** 기한 초과 ms (now - due) */
  overdue: number
  /** 그 시점의 기억 확률 */
  r: number
}

export interface PoolCard extends Rankable {
  card: Card
}

const CARD_ORDER: Record<CardType, number> = { reading: 0, meaning: 1 }
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** select.ts 의 byOverdue 와 같다 */
function byOverdue(a: Rankable, b: Rankable): number {
  return (
    b.overdue - a.overdue ||
    cmp(a.idiomId, b.idiomId) ||
    CARD_ORDER[a.cardType] - CARD_ORDER[b.cardType]
  )
}

function byRetrievability(a: Rankable, b: Rankable): number {
  return (
    b.r - a.r ||
    a.overdue - b.overdue ||
    cmp(a.idiomId, b.idiomId) ||
    CARD_ORDER[a.cardType] - CARD_ORDER[b.cardType]
  )
}

/** 풀에서 n 장을 정책 순서대로 고른다 (원본은 안 바꾼다) */
export function pick<T extends Rankable>(pool: readonly T[], n: number, policy: Policy): T[] {
  return [...pool].sort(policy === 'overdue' ? byOverdue : byRetrievability).slice(0, n)
}

/**
 * now 에 기한이 지난 카드 전부.
 *
 * 기본은 **읽기 카드만**이다. 뜻 카드는 교정 모드 숙어에서는 안 내는데(`activeCardTypes`) 모드를 정하려면
 * 사전이 필요해 여기서는 못 가른다 — 한 번 묻고 방치된 뜻 카드가 초과 30일+ 로 풀의 맨 앞을 차지해
 * P0 첫 세션을 왜곡했다(2026-10-20 풀 515장 중 뜻 86장). `includeMeaning` 은 민감도 확인용이다.
 */
export function duePool(state: ReplayState, now: number, includeMeaning = false): PoolCard[] {
  const out: PoolCard[] = []
  for (const st of state.cards.values()) {
    if (!includeMeaning && st.cardType === 'meaning') continue
    if (!isDue(st.card, now)) continue
    out.push({
      idiomId: st.idiomId,
      cardType: st.cardType,
      overdue: now - st.card.due.getTime(),
      r: retrievability(st.card, now),
      card: st.card,
    })
  }
  return out
}

/** P0 정렬이 select.ts 의 selectSession 과 같은 카드를 뽑는지 대조하기 위한 호출 */
export function selectSessionKeys(
  state: ReplayState,
  now: number,
  limit: number,
  includeMeaning = false,
): Set<string> {
  const ids = new Set<string>()
  for (const st of state.cards.values()) ids.add(st.idiomId)
  // 담은 것은 신규 도입 몫이라 비운다. 뜻 포함이면 확장 모드(읽기+뜻)만, 아니면 교정 모드(읽기)만 쓰고 몫을 한쪽에 몰아 한 줄로 섞는다
  const stripped: ReplayState = { ...state, starred: new Set() }
  const items = selectSession(
    [...ids].map((idiomId) => ({ idiomId, band: 1 as const, mode: includeMeaning ? ('expansion' as const) : ('correction' as const), pairIds: [] })),
    stripped,
    { now, limit, ratio: includeMeaning ? { correction: 0, expansion: 1 } : { correction: 1, expansion: 0 } },
  )
  return new Set(items.map((it) => cardKey(it.idiomId, it.cardType)))
}

// ───────────────────────── 캘리브레이션 ─────────────────────────

export interface Obs {
  /** cardKey(idiomId, cardType) */
  key: string
  cardType: CardType
  at: number
  /** 채점 직전 카드 상태로 낸 예측 기억 확률 */
  r: number
  /** 마지막 복습 뒤 지난 내림 일수 */
  elapsed: number
  correct: boolean
}

/**
 * 이벤트를 시간순으로 접으며 「채점 직전 예측 R ↔ 실제 정답」 관측을 모은다.
 * 첫 복습(카드가 없던 순간)은 예측할 상태가 없어 뺀다.
 * replay.ts 와 같은 카드 접기(newCard → applyGrade)라서 마지막 카드 상태가 replay 와 같음을 main·테스트가 대조한다.
 */
export function foldObservations(events: readonly LearningEvent[]): {
  obs: Obs[]
  cards: Map<string, Card>
} {
  const reviews = events
    .filter((e): e is ReviewEvent => e.type === 'review' && e.deletedAt === null)
    .sort(compareEvents)
  const cards = new Map<string, Card>()
  const obs: Obs[] = []
  for (const e of reviews) {
    const key = cardKey(e.idiomId, e.cardType)
    const prev = cards.get(key)
    if (prev !== undefined) {
      obs.push({
        key,
        cardType: e.cardType,
        at: e.at,
        r: retrievability(prev, e.at),
        elapsed: elapsedDays(prev, e.at),
        correct: e.correct,
      })
    }
    cards.set(key, applyGrade(prev ?? newCard(e.at), e.at, e.grade))
  }
  return { obs, cards }
}

export interface Bucket {
  n: number
  correct: number
  predSum: number
}

const emptyBuckets = (): Bucket[] => Array.from({ length: BUCKETS }, () => ({ n: 0, correct: 0, predSum: 0 }))

/** 경과 일수 등급 — 0일(같은 날), 1~2일, 3일+ */
export function elapsedClass(elapsed: number): 0 | 1 | 2 {
  return elapsed <= 0 ? 0 : elapsed <= 2 ? 1 : 2
}

export function bucketOf(r: number): number {
  return Math.min(Math.max(Math.floor(r * BUCKETS), 0), BUCKETS - 1)
}

export interface Calibration {
  /** 경과 등급별 */
  cls: [Bucket[], Bucket[], Bucket[]]
  /** 경과 1일+ (등급 1·2 합) */
  late: Bucket[]
  /** 전부 */
  all: Bucket[]
}

export function buildCalibration(obs: readonly Obs[]): Calibration {
  const cal: Calibration = {
    cls: [emptyBuckets(), emptyBuckets(), emptyBuckets()],
    late: emptyBuckets(),
    all: emptyBuckets(),
  }
  const add = (b: Bucket, o: Obs) => {
    b.n++
    b.predSum += o.r
    if (o.correct) b.correct++
  }
  for (const o of obs) {
    const i = bucketOf(o.r)
    const c = elapsedClass(o.elapsed)
    add(cal.cls[c][i]!, o)
    add(cal.all[i]!, o)
    if (c > 0) add(cal.late[i]!, o)
  }
  return cal
}

/**
 * 예측 R 을 이 사용자의 실제 정답률로 바꾼다.
 * 같은 경과 등급의 구간 → 경과 1일+ 의 구간 → (표본 부족이면) 예측 R 그대로.
 * 경과 0일 카드는 표본이 부족하면 R=1 그대로 쓴다.
 */
export function calibrated(cal: Calibration, r: number, elapsed: number): number {
  return calibratedWithSource(cal, r, elapsed).value
}

/** 보정 값과, 표본이 모자라 예측 R 그대로 쓴 경우(fallback)인지 */
export function calibratedWithSource(
  cal: Calibration,
  r: number,
  elapsed: number,
): { value: number; fallback: boolean } {
  const i = bucketOf(r)
  const c = elapsedClass(elapsed)
  const own = cal.cls[c][i]!
  if (own.n >= MIN_BUCKET_N) return { value: own.correct / own.n, fallback: false }
  if (c > 0) {
    const late = cal.late[i]!
    if (late.n >= MIN_BUCKET_N) return { value: late.correct / late.n, fallback: false }
  }
  return { value: r, fallback: true }
}

// ───────────────────────── 소진 모의 ─────────────────────────

export interface BacklogRun {
  /** pool 인덱스 → 처리된 세션 번호(0 부터) */
  sessionOf: number[]
  /** pool 인덱스 → 처리된 날(0 부터, 첫 세션 날 기준) */
  dayOf: number[]
  /** pool 인덱스 → 처리 시점의 예측 R */
  rAt: number[]
  /** pool 인덱스 → 처리 시점의 경과 일수 */
  elapsedAt: number[]
  sessions: number
}

/**
 * S0 만 다루는 소진 모의. 세션 k 는 now0 + floor(k / perDay) 일, 0회차는 `first` 정책, 이후는 P0.
 * perDay = 하루 세션 수 (1 이면 하루 1세션)
 */
export function runBacklog(
  pool: readonly PoolCard[],
  now0: number,
  first: Policy,
  perDay = 1,
  size = SESSION,
): BacklogRun {
  const sessionOf = new Array<number>(pool.length).fill(-1)
  const dayOf = new Array<number>(pool.length).fill(-1)
  const rAt = new Array<number>(pool.length).fill(NaN)
  const elapsedAt = new Array<number>(pool.length).fill(0)
  let remaining = pool.map((_, i) => i)
  let k = 0
  while (remaining.length > 0) {
    const day = Math.floor(k / perDay)
    const now = now0 + day * DAY_MS
    const live = remaining.map((i) => ({
      i,
      idiomId: pool[i]!.idiomId,
      cardType: pool[i]!.cardType,
      overdue: pool[i]!.overdue + day * DAY_MS,
      r: retrievability(pool[i]!.card, now),
    }))
    const chosen = pick(live, size, k === 0 ? first : 'overdue')
    const gone = new Set<number>()
    for (const c of chosen) {
      sessionOf[c.i] = k
      dayOf[c.i] = day
      rAt[c.i] = c.r
      elapsedAt[c.i] = elapsedDays(pool[c.i]!.card, now)
      gone.add(c.i)
    }
    remaining = remaining.filter((i) => !gone.has(i))
    k++
  }
  return { sessionOf, dayOf, rAt, elapsedAt, sessions: k }
}

// ───────────────────────── 한 칸(T, g) 평가 ─────────────────────────

/** 원 값(FSRS 예측), 보정 값(전 기록 표), 보정 값(T 이전 기록 표만) + 진단 비율 */
export interface Triple {
  raw: number
  cal: number
  calWf: number
  /** 전 기록 표에서 표본 부족으로 예측 R 그대로 쓴 카드의 비율 */
  fallback: number
  /** 경과 0일(같은 날 재출제 대기) 카드의 비율 */
  sameDay: number
}

/** 하루 세션 수 후보 — 1 은 과제 명세, 5 는 하루 100장(최근 14학습일 일 채점 중앙값은 재출제 포함 약 185건) */
export const SESSIONS_PER_DAY = [1, 5]

export interface BacklogCell {
  /** 모든 S0 카드가 처리될 때까지 걸리는 세션 수 (정책과 무관) */
  sessions: number
  /** 그 세션 수가 걸리는 일수 */
  days: number
  /** 3일 뒤 남는 수 */
  left3: number
  /** P1 첫 세션 때문에 P0 보다 늦게 처리되는 일수 — 카드별 (P1 처리일 − P0 처리일) */
  extraMax: number
  extraMean: number
  /** 가장 오래 밀린(초과 최대) 카드의 추가 지연 */
  extraTop: number
  /** 추가 지연이 1일+ 인 카드 수 */
  delayedN: number
  /** S0 전부를 소진하는 동안 처리 시점 기억 확률의 평균 */
  clear: Record<Policy, Triple>
}

export interface Cell {
  /** 기한 지난 카드 수 */
  b: number
  /** 첫 세션 20장의 평균 기억 확률 */
  first: Record<Policy, Triple>
  /** 하루 세션 수 → 소진 모의 */
  back: Record<number, BacklogCell>
}

const NAN_TRIPLE: Triple = { raw: NaN, cal: NaN, calWf: NaN, fallback: NaN, sameDay: NaN }

function meanOf(xs: readonly number[]): number {
  return xs.length === 0 ? NaN : xs.reduce((s, x) => s + x, 0) / xs.length
}

function tripleOf(
  items: readonly { r: number; elapsed: number }[],
  cal: Calibration,
  calWf: Calibration,
): Triple {
  if (items.length === 0) return NAN_TRIPLE
  const withSrc = items.map((x) => calibratedWithSource(cal, x.r, x.elapsed))
  return {
    raw: meanOf(items.map((x) => x.r)),
    cal: meanOf(withSrc.map((x) => x.value)),
    calWf: meanOf(items.map((x) => calibrated(calWf, x.r, x.elapsed))),
    fallback: meanOf(withSrc.map((x) => (x.fallback ? 1 : 0))),
    sameDay: meanOf(items.map((x) => (x.elapsed <= 0 ? 1 : 0))),
  }
}

function backlogCell(
  pool: readonly PoolCard[],
  now: number,
  perDay: number,
  cal: Calibration,
  calWf: Calibration,
): BacklogCell {
  const clear = {} as Record<Policy, Triple>
  const runs = {} as Record<Policy, BacklogRun>
  for (const p of POLICIES) {
    runs[p] = runBacklog(pool, now, p, perDay)
    clear[p] = tripleOf(
      pool.map((_, i) => ({ r: runs[p].rAt[i]!, elapsed: runs[p].elapsedAt[i]! })),
      cal,
      calWf,
    )
  }
  const extra = pool.map((_, i) => runs.retrievability.dayOf[i]! - runs.overdue.dayOf[i]!)
  const topIdx = pool.length === 0 ? -1 : pool.indexOf(pick(pool, 1, 'overdue')[0]!)
  return {
    sessions: runs.overdue.sessions,
    days: Math.max(...runs.overdue.dayOf, -1) + 1,
    left3: Math.max(pool.length - 3 * perDay * SESSION, 0),
    extraMax: extra.length === 0 ? 0 : Math.max(...extra),
    extraMean: meanOf(extra) || 0,
    extraTop: topIdx < 0 ? 0 : extra[topIdx]!,
    delayedN: extra.filter((x) => x > 0).length,
    clear,
  }
}

export function evalCell(
  pool: readonly PoolCard[],
  now: number,
  cal: Calibration,
  calWf: Calibration,
): Cell {
  const first = {} as Record<Policy, Triple>
  for (const p of POLICIES) {
    first[p] = tripleOf(
      pick(pool, SESSION, p).map((c) => ({ r: c.r, elapsed: elapsedDays(c.card, now) })),
      cal,
      calWf,
    )
  }
  const back: Record<number, BacklogCell> = {}
  for (const perDay of SESSIONS_PER_DAY) back[perDay] = backlogCell(pool, now, perDay, cal, calWf)
  return { b: pool.length, first, back }
}

// ───────────────────────── 입력·출력 ─────────────────────────

function loadEvents(dir: string): LearningEvent[] {
  const seen = new Map<string, LearningEvent>()
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const parsed = JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`${f} 가 이벤트 배열이 아니다. 건너뛴다.`)
      continue
    }
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }
  return [...seen.values()].filter((e) => e.deletedAt === null)
}

const pct = (x: number, d = 1) => (Number.isNaN(x) ? '—' : `${(x * 100).toFixed(d)}%`)
const num = (x: number, d = 1) => (Number.isNaN(x) ? '—' : x.toFixed(d))
const dayStr = (d: number) => new Date(d * DAY_MS).toISOString().slice(0, 10)

function printCalibration(cal: Calibration, obs: readonly Obs[]): void {
  console.log('--- 캘리브레이션: 채점 직전 예측 R 구간별 실제 정답률 (읽기 카드, 첫 복습 제외) ---')
  console.log('R 구간      |   전체 n  예측  실제 | 경과 1일+ n  예측  실제 | 경과 3일+ n  예측  실제')
  const cell = (b: Bucket) =>
    b.n === 0
      ? '     0     —     —'
      : `${String(b.n).padStart(6)} ${pct(b.predSum / b.n, 0).padStart(5)} ${pct(b.correct / b.n, 0).padStart(5)}`
  for (let i = 0; i < BUCKETS; i++) {
    const label = `${(i / BUCKETS).toFixed(1)}~${((i + 1) / BUCKETS).toFixed(1)}`
    console.log(`${label.padEnd(11)} | ${cell(cal.all[i]!)}  | ${cell(cal.late[i]!)}   | ${cell(cal.cls[2][i]!)}`)
  }
  const sum = (f: (o: Obs) => boolean) => {
    const xs = obs.filter(f)
    return {
      n: xs.length,
      pred: meanOf(xs.map((o) => o.r)),
      act: meanOf(xs.map((o) => (o.correct ? 1 : 0))),
    }
  }
  for (const [label, f] of [
    ['전체', () => true],
    ['경과 1일+', (o: Obs) => o.elapsed >= 1],
    ['경과 3일+', (o: Obs) => o.elapsed >= 3],
    ['경과 7일+', (o: Obs) => o.elapsed >= 7],
  ] as const) {
    const s = sum(f)
    console.log(`  ${label.padEnd(9)} n=${s.n}: 예측 평균 ${pct(s.pred)}, 실제 평균 ${pct(s.act)} (차 ${num((s.act - s.pred) * 100)}%p)`)
  }
}

function aggregate(cells: readonly Cell[], pickFn: (c: Cell) => number): number {
  return meanOf(cells.map(pickFn).filter((x) => !Number.isNaN(x)))
}

/**
 * 모형 검증 — 시점 T 다음 날 실제 첫 SESSION 장(경과 1일+ 카드의 채점)에서
 * 예측 R 평균, 보정 평균, 실제 정답률을 나란히 놓는다. 보정(T 이전만)은 그 시점까지의 표.
 */
export function nextDayCheck(
  obs: readonly Obs[],
  days: readonly number[],
  calAll: Calibration,
): { n: number; raw: number; cal: number; calWf: number; actual: number } {
  const rows: { raw: number; cal: number; calWf: number; actual: number }[] = []
  for (const day of days) {
    const first = obs.filter((o) => o.elapsed >= 1 && kstDay(o.at) === day + 1).slice(0, SESSION)
    if (first.length < SESSION) continue
    const calWf = buildCalibration(obs.filter((o) => o.at <= endOfKstDay(day)))
    rows.push({
      raw: meanOf(first.map((o) => o.r)),
      cal: meanOf(first.map((o) => calibrated(calAll, o.r, o.elapsed))),
      calWf: meanOf(first.map((o) => calibrated(calWf, o.r, o.elapsed))),
      actual: meanOf(first.map((o) => (o.correct ? 1 : 0))),
    })
  }
  return {
    n: rows.length,
    raw: meanOf(rows.map((r) => r.raw)),
    cal: meanOf(rows.map((r) => r.cal)),
    calWf: meanOf(rows.map((r) => r.calWf)),
    actual: meanOf(rows.map((r) => r.actual)),
  }
}

interface Sim {
  cells: Map<number, Cell[]>
  /** g=0 풀(T 끝)의 P0 순위로 본, 다음 날 실제 첫 20장(경과 1일+)의 순위 */
  ranks: number[]
  p0Checked: number
  p0Mismatch: number
}

/** 모든 (T, g) 칸을 돌린다. obs 는 풀과 같은 카드 종류만 담아 넘긴다 */
function simulate(
  events: readonly LearningEvent[],
  obs: readonly Obs[],
  days: readonly number[],
  calAll: Calibration,
  includeMeaning: boolean,
): Sim {
  const sim: Sim = { cells: new Map(GAPS.map((g) => [g, []])), ranks: [], p0Checked: 0, p0Mismatch: 0 }
  for (const day of days) {
    const T = endOfKstDay(day)
    const state = replay(events.filter((e) => e.at <= T))
    const calWf = buildCalibration(obs.filter((o) => o.at <= T))
    for (const g of GAPS) {
      const now = T + g * DAY_MS
      const pool = duePool(state, now, includeMeaning)
      if (g === 0) {
        const rank = new Map(pick(pool, pool.length, 'overdue').map((c, i) => [cardKey(c.idiomId, c.cardType), i]))
        const actual = obs.filter((o) => o.elapsed >= 1 && kstDay(o.at) === day + 1).slice(0, SESSION)
        if (actual.length >= SESSION) for (const o of actual) sim.ranks.push(rank.get(o.key) ?? Infinity)
      }
      if (pool.length >= SESSION) {
        const mine = new Set(pick(pool, SESSION, 'overdue').map((c) => cardKey(c.idiomId, c.cardType)))
        const real = selectSessionKeys(state, now, SESSION, includeMeaning)
        sim.p0Checked++
        if (mine.size !== real.size || [...mine].some((k) => !real.has(k))) sim.p0Mismatch++
      }
      sim.cells.get(g)!.push(evalCell(pool, now, calAll, calWf))
    }
  }
  return sim
}

function printTable1(sim: Sim, label: string, nDays: number): void {
  console.log(`--- ${label}. 첫 세션 예상 정답률 (T ${nDays}개 평균). 원=FSRS 예측, 보정=이 사용자 실측 표로 바꾼 값 ---`)
  console.log('        |  기한 지난 |      원 값       |   보정(전 기록)   |  보정(T 이전만)   | 보정이 예측 R 로 물러난 비율 | 경과 0일 카드 비율')
  console.log('공백 g  |  평균 수   |  P0     P1     차 |  P0     P1     차 |  P0     P1     차 |      P0      P1         |    P0      P1')
  for (const g of GAPS) {
    const cs = sim.cells.get(g)!
    const row = (f: (t: Triple) => number) => {
      const p0 = aggregate(cs, (c) => f(c.first.overdue))
      const p1 = aggregate(cs, (c) => f(c.first.retrievability))
      return `${pct(p0).padStart(6)} ${pct(p1).padStart(6)} ${(num((p1 - p0) * 100) + '%p').padStart(7)}`
    }
    const share = (f: (t: Triple) => number) =>
      `${pct(aggregate(cs, (c) => f(c.first.overdue)), 0).padStart(6)} ${pct(aggregate(cs, (c) => f(c.first.retrievability)), 0).padStart(7)}`
    console.log(
      `${String(g).padStart(3)}일   | ${num(aggregate(cs, (c) => c.b)).padStart(9)}  | ${row((t) => t.raw)} | ${row((t) => t.cal)} | ${row((t) => t.calWf)} |      ${share((t) => t.fallback)}        | ${share((t) => t.sameDay)}`,
    )
  }
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다. 백업 JSON 을 넣는다 (--dir= 로 다른 경로 지정 가능).`)
    process.exit(1)
  }
  const events = loadEvents(EVENTS_DIR)
  const reviews = events.filter((e): e is ReviewEvent => e.type === 'review')
  if (reviews.length === 0) {
    console.error('채점 이벤트가 없다.')
    process.exit(1)
  }
  const lastDay = kstDay(Math.max(...reviews.map((e) => e.at)))
  const firstDay = kstDay(Date.parse(`${FIRST_T_DAY}T00:00:00+09:00`))
  const days = Array.from({ length: lastDay - firstDay + 1 }, (_, i) => firstDay + i)

  const perDayCount = new Map<number, number>()
  for (const e of reviews) perDayCount.set(kstDay(e.at), (perDayCount.get(kstDay(e.at)) ?? 0) + 1)
  const recent = [...perDayCount.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-14)
    .map((x) => x[1])
    .sort((a, b) => a - b)

  console.log('=== 돌아온 날의 첫 세션 시뮬레이션 (PLAN §11 S1) ===')
  console.log(
    `채점 ${reviews.length}건 (뜻 카드 ${reviews.filter((e) => e.cardType === 'meaning').length}건, ${dayStr(kstDay(Math.min(...reviews.map((e) => e.at))))} ~ ${dayStr(lastDay)} KST). ` +
      `시점 T = ${dayStr(days[0]!)} ~ ${dayStr(lastDay)} 매일 끝 (${days.length}개), 공백 g = ${GAPS.join('/')}일, 세션 ${SESSION}장`,
  )
  console.log(
    `최근 14 학습일 일 채점(재출제 포함): 최소 ${recent[0]}, 중앙값 ${recent[Math.floor(recent.length / 2)]}, 최대 ${recent[recent.length - 1]}`,
  )
  console.log('기본 풀 = 기한 지난 읽기 카드. 뜻 카드는 모드를 몰라(사전 필요) 뺐다 — 민감도는 표 1-뜻 포함에서 본다.')

  // 접기 대조 — foldObservations 의 카드 상태가 replay 와 같아야 캘리브레이션이 같은 상태를 본 것이다
  const { obs: obsAll, cards: folded } = foldObservations(events)
  const full = replay(events)
  let mismatch = 0
  for (const [key, st] of full.cards) {
    const f = folded.get(key)
    if (!f || f.due.getTime() !== st.card.due.getTime() || f.stability !== st.card.stability) mismatch++
  }
  console.log(
    `접기 대조: replay 카드 ${full.cards.size}장 vs 캘리브레이션 접기 ${folded.size}장, 불일치 ${mismatch + Math.abs(full.cards.size - folded.size)}장`,
  )
  const obs = obsAll.filter((o) => o.cardType === 'reading')
  const calAll = buildCalibration(obs)
  console.log('')
  printCalibration(calAll, obs)

  const chk = nextDayCheck(obs, days, calAll)
  console.log('')
  console.log(`--- 모형 검증: T 다음 날 실제 첫 ${SESSION}장(경과 1일+ 읽기 채점) — ${chk.n}일 평균 ---`)
  console.log(
    `  예측 R(원) ${pct(chk.raw)} | 보정(전 기록) ${pct(chk.cal)} | 보정(T 이전만) ${pct(chk.calWf)} | 실제 정답률 ${pct(chk.actual)}`,
  )

  const sim = simulate(events, obs, days, calAll, false)
  console.log('')
  console.log(
    `P0 대조: 기한 지난 읽기 카드 ${SESSION}장+ 인 (T, g) ${sim.p0Checked}칸에서 selectSession 과 뽑은 집합이 다른 칸 ${sim.p0Mismatch}개`,
  )
  if (sim.ranks.length > 0) {
    const within = (n: number) => pct(sim.ranks.filter((r) => r < n).length / sim.ranks.length, 0)
    const finite = sim.ranks.filter((r) => Number.isFinite(r)).sort((a, b) => a - b)
    console.log(
      `실제 vs P0: 다음 날 실제 첫 ${SESSION}장(${sim.ranks.length}건)이 전날 끝 풀의 P0 순위 안에 든 비율 — 상위 20 ${within(20)}, 60 ${within(60)}, 100 ${within(100)}, 200 ${within(200)}, ` +
        `풀 밖 ${pct(sim.ranks.filter((r) => !Number.isFinite(r)).length / sim.ranks.length, 0)}, 풀 안 순위 중앙값 ${finite[Math.floor(finite.length / 2)]}`,
    )
  }

  console.log('')
  printTable1(sim, '표 1', days.length)

  console.log('')
  console.log('--- 표 1b. P1 − P0 의 T 간 분포 (보정 전 기록, %p). 이어진 날짜라 독립 표본이 아니다 ---')
  for (const g of GAPS) {
    const d = sim.cells
      .get(g)!
      .filter((c) => c.b > SESSION)
      .map((c) => (c.first.retrievability.cal - c.first.overdue.cal) * 100)
    d.sort((a, b) => a - b)
    console.log(
      `  g=${String(g).padStart(2)}일: B>${SESSION} 인 T ${d.length}개` +
        (d.length === 0
          ? ''
          : `, 최소 ${num(d[0]!)}, 중앙 ${num(d[Math.floor(d.length / 2)]!)}, 최대 ${num(d[d.length - 1]!)}, 평균 ${num(meanOf(d))}`),
    )
  }

  for (const perDay of SESSIONS_PER_DAY) {
    console.log('')
    console.log(
      `--- 표 2${perDay === 1 ? 'a' : 'b'}. 대가 — 밀린 복습 소진 (하루 ${perDay}세션 x ${SESSION}장 = ${perDay * SESSION}장/일, 첫 세션만 정책별·이후 P0, 처리된 카드는 풀에서 빠진다) ---`,
    )
    console.log('        |  기한 지난 |  소진 세션 /  일수  | 3일 뒤 | 추가 지연(일, P1−P0)                      | 소진 동안 처리시점 평균 R (원 / 보정 전 기록)')
    console.log('공백 g  |  평균 수   |  (평균)             | 남는 수| 카드 평균  최대(평균)  최오래밀린  지연 카드 수 | P0 원   P1 원  | P0 보정  P1 보정   차')
    for (const g of GAPS) {
      const cs = sim.cells.get(g)!
      const a = (f: (c: BacklogCell) => number) => aggregate(cs, (c) => f(c.back[perDay]!))
      const k0 = a((c) => c.clear.overdue.cal)
      const k1 = a((c) => c.clear.retrievability.cal)
      console.log(
        `${String(g).padStart(3)}일   | ${num(aggregate(cs, (c) => c.b)).padStart(9)}  | ${num(a((c) => c.sessions)).padStart(8)} / ${num(a((c) => c.days)).padStart(5)}   | ${num(a((c) => c.left3)).padStart(6)} | ` +
          `${num(a((c) => c.extraMean), 2).padStart(8)} ${String(Math.max(...cs.map((c) => c.back[perDay]!.extraMax))).padStart(4)}(${num(a((c) => c.extraMax)).padStart(4)}) ${num(a((c) => c.extraTop)).padStart(9)} ${num(a((c) => c.delayedN)).padStart(12)}   | ` +
          `${pct(a((c) => c.clear.overdue.raw)).padStart(6)} ${pct(a((c) => c.clear.retrievability.raw)).padStart(6)} | ${pct(k0).padStart(6)} ${pct(k1).padStart(7)} ${(num((k1 - k0) * 100, 2) + '%p').padStart(7)}`,
      )
    }
  }

  // 민감도 — 뜻 카드를 풀에 넣으면 (방치된 뜻 카드가 P0 앞자리를 차지한다)
  const calMeaning = buildCalibration(obsAll)
  const simM = simulate(events, obsAll, days, calMeaning, true)
  console.log('')
  console.log(
    `P0 대조(뜻 포함, 확장 모드 가정): ${simM.p0Checked}칸 중 selectSession 과 다른 칸 ${simM.p0Mismatch}개`,
  )
  printTable1(simM, '표 1-뜻 포함 (민감도)', days.length)

  console.log('')
  console.log('=== 모델 한계 ===')
  console.log('- 한 사람, 약 7주 기록. 실제로 쉰 구간이 없다 — 인위 공백은 「그동안 아무것도 안 했다」일 뿐 실제 복귀 행동(기억 되살리기, 다른 앱)을 모른다.')
  console.log('- 시점 T 가 매일이라 서로 겹친다(같은 카드·같은 기록). 표의 평균은 독립 표본의 평균이 아니고, 신뢰구간을 낼 수 없다.')
  console.log("- 기록의 복습 간격은 P0(기한 초과순) 아래서 만들어졌다. 실제 정답률은 '기한을 넘겨 늦게 만난' 카드에서만 관측되고, R 0.3 미만 구간은 관측이 없다. 첫 세션 20장이 표 안에 드는지는 표 1 「물러난 비율」이 보여 준다(0% 면 외삽 없음).")
  console.log(`- 캘리브레이션은 읽기 카드로만 만든다. 표 칸이 ${MIN_BUCKET_N}건 미만이면 덜 구체적인 표 → 예측 R 그대로로 물러난다.`)
  console.log('- 보정(전 기록)은 T 이후 기록을 보므로 낙관적이다(표본 내). 보정(T 이전만)이 시점 정보만 쓴 값이지만 이른 T 일수록 표가 성기다.')
  console.log('- FSRS R 의 경과 일수는 내림 일수라 같은 날 재출제 카드의 R 은 1 이다. g=0 의 P1 은 이런 카드(학습·재학습 단계)를 많이 집는다(표 1 「경과 0일 카드 비율」).')
  console.log('- 소진 모의는 고른 카드가 처리됐다고 보고 풀에서 뺀다. 오답 카드의 같은 날 재출제, 정답 카드의 새 간격은 안 쓴다(기대값 비교). 첫 세션만 다르므로 추가 지연은 구조상 한 세션 몫(20장)을 넘지 않는다.')
  console.log('- 뺀 규칙 — 신규 도입, 담은 것 몫, 훈독 정원, 교정:확장 7:3, 읽기 먼저 자리 맞바꿈, 뜻 카드(모드 규칙을 못 가려 기본 풀에서 제외).')
  console.log('- 「실제 vs P0」 줄이 보여 주듯 실제 세션은 순수 P0 상위 20장이 아니다(세션 길이·교정:확장 배분·섞기·신규 도입). 모형의 P0 는 「지금 규칙을 20장에 그대로 적용한 값」이지 실측이 아니다.')
  console.log('- 정답률 이외의 효과(좌절감, 복귀 지속)는 모델 밖이다. 이 시뮬레이션은 그 가설을 확인하거나 반박하지 못한다.')
}

if (import.meta.filename === process.argv[1]) main()
