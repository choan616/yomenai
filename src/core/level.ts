// 읽기 수준 — 밴드별 "숙지한 표현"과 "경계선". 리포트 최상단이 답해야 할 질문은 "내가 어디쯤인가"다 (PLAN §4/§7)
import { State } from 'ts-fsrs'
import { DIAGNOSTIC_BANDS } from './diagnostic.ts'
import { dateKey, dayNumber } from './attendance.ts'
import { wilson } from './wilson.ts'
import type { Band } from '../lib/bands.ts'
import { cardKey, compareEvents, type CardState, type LearningEvent } from './types.ts'

/**
 * "안정"의 문턱. `bandVerdict` 의 `OK_RATE` 와 같은 값을 쓴다 —
 * 진단이 "다음 밴드로" 넘긴 밴드가 리포트에서 "흔들림"으로 나오면 두 화면이 서로 다른 말을 한다.
 */
export const LEVEL_SOLID_RATE = 0.8
/**
 * 밴드 판정에 쓰는 **기간 창** — 그 코스의 마지막 채점일을 기준으로 이 일 수 안의 채점 전부 (2026-10-10).
 *
 * 「최근 30회」였다. 사용자 백업(35일)에서 하루 채점이 중앙값 220회라 30회는 하루의 7분의 1이었고,
 * 하루 세션 하나가 판정을 뒤집었다(학습일 세 번에 한 번꼴로 안정↔흔들림, 일간 변동 9.6%p).
 * 최근 7일 전부는 12번에 한 번(2.2%p)이고 다음 학습일 예측오차도 더 작다(10.3 vs 12.3%p).
 *
 * 기준일을 오늘이 아니라 **그 코스의 마지막 채점일**로 두는 이유는 며칠 쉬어도 창이 비지 않게 하려는 것이다
 * (옛 기록을 「최근」으로 보는 회수 기준의 장점을 그대로 가져온다). 전 기간을 통째로 접으면 첫 주의 실수가
 * 영원히 평균을 끌어내리는 문제는 기간 창이 막는다 (2026-09-13 실측: 밴드 1 이 전 기간 70.3% 인데 최근 3일은
 * 81.3% — 문턱 0.8 을 이미 넘겼는데 화면은 「흔들림」이라 말했다). 누적 총계(`totalReadings`)는 안 건드린다.
 */
export const LEVEL_WINDOW_DAYS = 7
/**
 * 판정을 내리는 데 필요한 **최소 채점 수** — 30회로는 정답률 80% 근처의 95% 오차가 ±14%p 라 73% 와 80% 를
 * 못 가른다. 100회면 ±8%p 다 (2026-10-10 사용자 「30회는 최소 학습량, 신뢰 범위로 올려야 한다」).
 * 기간 창이 이보다 적으면 **최근 이 횟수까지 창을 넓힌다**. 그 아래는 `thin`(표본 부족)이다.
 */
export const LEVEL_MIN_GRADES = 100
/**
 * 판정에 필요한 **서로 다른 표현 수**. 같은 표현을 반복 채점한 것은 서로 독립이 아니라서 채점 수만으로는
 * 표본이 부풀려진다 — 하루 세션의 재도전이 그렇다.
 */
export const LEVEL_MIN_IDIOMS = 60

/**
 * 읽기 카드를 "숙지했다"고 보는 FSRS 안정 간격. 뜻 카드의 `MEANING_STABLE_DAYS`(21)와
 * 따로 두는 이유는 시뮬레이션이 14 를 골랐기 때문이다 (`npm run sim:level`, 2026-09-19 절) —
 * 7일이면 아직 안 익힌 것까지 세고(오차 +16.5%p), 21일이면 익힌 것을 한참 빼먹는다(−15.9%p).
 */
export const READING_STABLE_DAYS = 14

/**
 * 수준 지표가 재는 마지막 밴드. 밴드 4 는 출제 범위 밖이라 담은 것만 들어오므로
 * 진도로 세지 않는다 (2026-09-26 사용자 판단). 표에는 남기되 총계·그래프·판정에서 뺀다
 */
export const LEVEL_MAX_BAND = 3

/**
 * 이 읽기 카드를 「숙지」로 보는가 (2026-09-23).
 *
 * **판정이 두 자리에 있으면 언젠가 갈라진다.** 밴드 사다리와 음독 맵이 서로의 수치를
 * 인용하게 되면서(사용자 보고 「음독맵의 숫자와 밴드의 숫자가 다르다」) 두 화면이 같은
 * 정의를 써야 할 이유가 생겼다 — `reclassifier` 를 한 자리에 둔 것과 같은 관례다.
 */
export function isReadingStable(card: CardState['card']): boolean {
  return card.state === State.Review && card.stability >= READING_STABLE_DAYS
}

/**
 * 숙지한 읽기 카드 수. **밴드 사다리의 `stable` 합과 같은 값이다.**
 *
 * `inPool` 은 출제 범위다 — 훈독을 꺼 놓으면 그 숙어는 앞으로 안 나오므로 총량에서도
 * 뺀다 (`buildLevel` 의 `bandOf` 가 `undefined` 를 돌려주는 것과 같은 몫).
 */
export function stableReadingCount(
  cards: ReadonlyMap<string, CardState>,
  inPool: (idiomId: string) => boolean,
): number {
  let n = 0
  for (const [key, st] of cards) {
    if (st.cardType !== 'reading' || key !== cardKey(st.idiomId, 'reading')) continue
    if (!inPool(st.idiomId)) continue
    if (isReadingStable(st.card)) n++
  }
  return n
}

/**
 * 밴드 상태 — 정답률의 점 추정치가 아니라 **95% 오차 구간**으로 가른다 (2026-10-10).
 *
 * - `solid` : 구간의 아래쪽이 문턱(80%) 이상 — 오차를 감안해도 안정이다
 * - `shaky` : 구간의 위쪽이 문턱 미만 — 오차를 감안해도 흔들린다
 * - `near`  : 구간이 문턱을 품는다 — 아직 안정인지 흔들림인지 가를 수 없다(기준 부근)
 * - `thin`  : 표본이 모자라 판정을 안 낸다 (`LEVEL_MIN_GRADES`·`LEVEL_MIN_IDIOMS`)
 * - `unseen`: 채점이 없다
 *
 * 점 하나로 가르면 적은 표본의 한 번 튄 값으로 「안정」을 선언한다. 구간은 학습을 많이 할수록 좁아져
 * 판정이 선명해진다.
 */
export type BandStatus = 'solid' | 'near' | 'shaky' | 'thin' | 'unseen'

/** 판정 창에 들어가는 채점 하나 — 날짜 순으로 쌓는다 */
export interface WindowEntry {
  /** 로컬 날짜 키 `YYYY-MM-DD` */
  date: string
  correct: boolean
  idiomId: string
}

/**
 * 판정 창 — **최근 `LEVEL_WINDOW_DAYS` 일 전부, 모자라면 최근 `LEVEL_MIN_GRADES` 회까지** (둘 중 넓은 쪽).
 * 기준일은 `entries` 의 마지막 채점일이다. `entries` 는 시간 오름차순이다.
 * 수준 표·소견·추이 그래프·달력의 도달 표식이 모두 이 함수를 쓴다 — 같은 창이어야 값이 어긋나지 않는다.
 */
export function selectWindow<T extends { date: string }>(entries: readonly T[]): T[] {
  if (entries.length === 0) return []
  const last = dayNumber(entries[entries.length - 1]!.date)
  let i = entries.length
  while (
    i > 0 &&
    (entries.length - i < LEVEL_MIN_GRADES || last - dayNumber(entries[i - 1]!.date) < LEVEL_WINDOW_DAYS)
  ) {
    i--
  }
  return entries.slice(i)
}

/** 판정 창 하나를 판정한다 */
export function judgeWindow(win: readonly WindowEntry[]): {
  status: BandStatus
  seen: number
  correct: number
  idioms: number
  ci: [number, number]
} {
  const seen = win.length
  const correct = win.filter((e) => e.correct).length
  const idioms = new Set(win.map((e) => e.idiomId)).size
  const ci = wilson(correct, seen)
  let status: BandStatus
  if (seen === 0) status = 'unseen'
  else if (seen < LEVEL_MIN_GRADES || idioms < LEVEL_MIN_IDIOMS) status = 'thin'
  else if (ci[0] >= LEVEL_SOLID_RATE) status = 'solid'
  else if (ci[1] < LEVEL_SOLID_RATE) status = 'shaky'
  else status = 'near'
  return { status, seen, correct, idioms, ci }
}

export interface BandRow {
  band: Band
  /** 판정 창의 채점 수 (`selectWindow`) */
  seen: number
  correct: number
  /** correct / seen. seen 이 0 이면 0 */
  rate: number
  /** 판정 창의 서로 다른 표현 수 */
  idioms: number
  /** 정답률의 95% 구간(0~1) */
  ci: [number, number]
  status: BandStatus
  /**
   * **출제된 적 있는** 표현 수. 카드 상태는 채점 이벤트가 있어야 생기므로
   * 소개 카드로만 본 표현은 안 들어간다 (소개는 이벤트가 아니라 localStorage 다).
   * 화면 라벨이 「만난」 → 「푼」 → 「출제된 표현」 으로 바뀐 이유가 이것이다.
   * **틀린 것도 SKIP 도 들어간다** — 「맞춘」 이 아니다 (2026-09-20 사용자 확인)
   */
  met: number
  /**
   * 그중 숙지한 표현 수. **이쪽이 수준이다** — 정답률은 순간 상태(흔들림)라 표본이 흔들면
   * 같이 흔들리지만(실측: 300세션에 억울한 뒤집힘 37회), 붙은 개수는 안 흔들린다(0회).
   * 카드 상태를 안 넘기면 0 이다
   */
  stable: number
}

export interface LevelProfile {
  /** 밴드 오름차순. 기본 학습 범위 + 실제로 푼 적 있는 밴드 */
  bands: BandRow[]
  /** 낮은 밴드부터 끊기지 않고 `solid` 인 마지막 밴드. 없으면 null */
  solidThrough: Band | null
  /** 낮은 밴드부터 끊기지 않고 `solid` 또는 `near` 인 마지막 밴드. 없으면 null */
  nearThrough: Band | null
  /** `near`(기준 부근) 인 밴드들 (오름차순) */
  near: Band[]
  /** 지금 흔들리는 첫 밴드. 없으면 null (아직 벽을 못 만났다) */
  edge: Band | null
  /** 읽기 카드 채점 **누적** 총 횟수. 밴드 행의 `seen`(판정 창)과 다르다 */
  totalReadings: number
}

/**
 * 전체 이벤트 로그에서 밴드별 읽기 성적을 접는다.
 *
 * 진단 결과를 따로 저장하지 않는 이유는 append-only 로그로 언제든 다시 셀 수 있어서다
 * (PLAN §5 원칙 2). 그래서 이 프로필은 진단 직후에도, 세션을 100번 한 뒤에도 같은
 * 함수가 낸다 — 진단은 시작점일 뿐 수준의 출처가 아니다.
 */
export function buildLevel(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
  /** 재생해 둔 카드 상태. 있으면 밴드별 "숙지한 표현"을 같이 센다 */
  cards?: ReadonlyMap<string, CardState>,
): LevelProfile {
  // 밴드별로 시간순 채점 이력을 모은다. 뒤에서 `selectWindow` 로 판정 창만 쓴다
  const history = new Map<Band, WindowEntry[]>()
  let totalReadings = 0
  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined) continue
    totalReadings++
    const entry: WindowEntry = { date: dateKey(e.at), correct: e.correct, idiomId: e.idiomId }
    const row = history.get(band)
    if (row) row.push(entry)
    else history.set(band, [entry])
  }

  const bands = [...new Set<Band>([...DIAGNOSTIC_BANDS, ...history.keys()])].sort((a, b) => a - b)

  // 밴드별 출제된 표현 / 숙지한 표현 — 정답률과 달리 창을 안 씌운다. 재고는 쌓인 것 전부다
  const met = new Map<Band, number>()
  const stable = new Map<Band, number>()
  for (const [key, st] of cards ?? []) {
    if (st.cardType !== 'reading' || key !== cardKey(st.idiomId, 'reading')) continue
    const band = bandOf(st.idiomId)
    if (band === undefined) continue
    met.set(band, (met.get(band) ?? 0) + 1)
    if (isReadingStable(st.card)) {
      stable.set(band, (stable.get(band) ?? 0) + 1)
    }
  }

  const rows: BandRow[] = bands.map((band) => {
    const j = judgeWindow(selectWindow(history.get(band) ?? []))
    return {
      band,
      seen: j.seen,
      correct: j.correct,
      rate: j.seen > 0 ? j.correct / j.seen : 0,
      idioms: j.idioms,
      ci: j.ci,
      status: j.status,
      met: met.get(band) ?? 0,
      stable: stable.get(band) ?? 0,
    }
  })

  /**
   * **수준은 밴드 0~3 으로 잰다** (2026-09-26 사용자 판단 「그래프나 숙지율에는 밴드 4를
   * 노출하지 않는 게 나을 것 같다」).
   *
   * 밴드 4 는 출제 범위 밖이라 **담은 것만** 들어온다. 내가 골라 넣은 열 개가 흔들린다고
   * 「밴드 4 가 경계」라고 말하면 사다리의 뜻이 달라진다 — 그건 진도가 아니라 곁가지다.
   * 표에는 그대로 두되(출제·정답률은 볼 값이 있다) 판정에서만 뺀다.
   */
  const inScope = rows.filter((r) => r.band <= LEVEL_MAX_BAND)

  let solidThrough: Band | null = null
  for (const row of inScope) {
    if (row.status !== 'solid') break
    solidThrough = row.band
  }
  let nearThrough: Band | null = null
  for (const row of inScope) {
    if (row.status !== 'solid' && row.status !== 'near') break
    nearThrough = row.band
  }

  return {
    bands: rows,
    solidThrough,
    nearThrough,
    near: inScope.filter((r) => r.status === 'near').map((r) => r.band),
    edge: inScope.find((r) => r.status === 'shaky')?.band ?? null,
    // 누적이다. 밴드 행의 `seen` 은 판정 창으로 잘려 있어 합과 다르다
    totalReadings,
  }
}

/**
 * 밴드 안정(`solidThrough`)이 **지금까지의 최고치를 새로 넘긴 날** → 그날 닿은 밴드
 * (2026-09-30, 리포트 달력의 도달 표식). 출석을 진전과 잇는 자리다.
 *
 * 판정은 `buildLevel` 과 같다 — 같은 `judgeWindow`·같은 밴드 목록·같은 판정 창. 날마다
 * `buildLevel` 을 처음부터 돌리면 O(일수 × 이벤트)라 한 번 훑으며 하루 끝마다 판정한다.
 * 창 때문에 판정이 내려갔다 되찾을 수 있는데, 내려간 건 안 남기고(네거티브 표시 금지)
 * 되찾은 것도 새 높이가 아니면 다시 안 센다.
 */
export function solidReachDays(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
): Map<string, Band> {
  const history = new Map<Band, WindowEntry[]>()
  const out = new Map<string, Band>()
  let best: Band | null = null

  const settle = (date: string) => {
    const bands = [...new Set<Band>([...DIAGNOSTIC_BANDS, ...history.keys()])]
      .filter((b) => b <= LEVEL_MAX_BAND)
      .sort((a, b) => a - b)
    let through: Band | null = null
    for (const band of bands) {
      if (judgeWindow(selectWindow(history.get(band) ?? [])).status !== 'solid') break
      through = band
    }
    if (through !== null && (best === null || through > best)) {
      best = through
      out.set(date, through)
    }
  }

  let day: string | null = null
  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined) continue
    const key = dateKey(e.at)
    if (day !== null && key !== day) settle(day)
    day = key
    const entry: WindowEntry = { date: key, correct: e.correct, idiomId: e.idiomId }
    const row = history.get(band)
    if (row) row.push(entry)
    else history.set(band, [entry])
  }
  if (day !== null) settle(day)
  return out
}
