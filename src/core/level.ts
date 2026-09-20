// 읽기 수준 — 밴드별 "숙지한 표현"과 "경계선". 리포트 최상단이 답해야 할 질문은 "내가 어디쯤인가"다 (PLAN §4/§7)
import { State } from 'ts-fsrs'
import { DIAGNOSTIC_BANDS } from './diagnostic.ts'
import type { Band } from '../lib/bands.ts'
import { cardKey, compareEvents, type CardState, type LearningEvent } from './types.ts'

/** 밴드 하나에 판정을 내리는 데 필요한 최소 노출 수. 그 아래는 `thin`(표본 부족)이다 */
export const LEVEL_MIN_SEEN = 5
/**
 * "안정"의 문턱. `bandVerdict` 의 `OK_RATE` 와 같은 값을 쓴다 —
 * 진단이 "다음 밴드로" 넘긴 밴드가 리포트에서 "흔들림"으로 나오면 두 화면이 서로 다른 말을 한다.
 */
export const LEVEL_SOLID_RATE = 0.8
/**
 * 밴드 판정에 쓰는 **최근 N회**. 전 기간을 통째로 접으면 첫 주의 실수가 영원히 평균을
 * 끌어내려, 실력이 늘어도 사다리가 안 올라간다 (2026-09-13 실측: 밴드 1 이 전 기간 70.3%
 * 인데 최근 3일은 81.3% — 문턱 0.8 을 이미 넘겼는데 화면은 「흔들림」이라 말했다).
 * 「성취도는 깎이지 않는다」(PLAN §5 원칙 3)의 다른 얼굴이라 판정을 최근으로 옮긴다.
 *
 * **누적 총계(`totalReadings`)는 안 건드린다** — 그건 쌓아 온 양이고, 줄이면 그게 곧
 * 성취도를 깎는 것이다. 처방의 표본 문턱도 이 값을 본다.
 *
 * 회수 기준인 이유 — 날짜 기준(최근 N일)은 며칠 쉬면 표본이 비어 「표본 부족」으로 떨어진다.
 * 회수는 쉬어도 유지되고 FSRS 복습 주기와도 맞는다.
 */
export const LEVEL_WINDOW = 30

/**
 * 읽기 카드를 "숙지했다"고 보는 FSRS 안정 간격. 뜻 카드의 `MEANING_STABLE_DAYS`(21)와
 * 따로 두는 이유는 시뮬레이션이 14 를 골랐기 때문이다 (`npm run sim:level`, 2026-09-19 절) —
 * 7일이면 아직 안 익힌 것까지 세고(오차 +16.5%p), 21일이면 익힌 것을 한참 빼먹는다(−15.9%p).
 */
export const READING_STABLE_DAYS = 14

export type BandStatus = 'solid' | 'shaky' | 'thin' | 'unseen'

export interface BandRow {
  band: Band
  /** 판정에 쓴 채점 수 — 최근 `LEVEL_WINDOW` 회까지 */
  seen: number
  correct: number
  /** correct / seen. seen 이 0 이면 0 */
  rate: number
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
  /** 지금 흔들리는 첫 밴드. 없으면 null (아직 벽을 못 만났다) */
  edge: Band | null
  /** 읽기 카드 채점 **누적** 총 횟수. 밴드 행의 `seen`(최근 `LEVEL_WINDOW`)과 다르다 */
  totalReadings: number
}

function statusOf(seen: number, correct: number): BandStatus {
  if (seen === 0) return 'unseen'
  if (seen < LEVEL_MIN_SEEN) return 'thin'
  return correct / seen >= LEVEL_SOLID_RATE ? 'solid' : 'shaky'
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
  // 밴드별로 시간순 채점 이력을 모은다. 뒤에서 `LEVEL_WINDOW` 개만 판정에 쓴다
  const history = new Map<Band, boolean[]>()
  let totalReadings = 0
  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined) continue
    totalReadings++
    const row = history.get(band)
    if (row) row.push(e.correct)
    else history.set(band, [e.correct])
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
    if (st.card.state === State.Review && st.card.stability >= READING_STABLE_DAYS) {
      stable.set(band, (stable.get(band) ?? 0) + 1)
    }
  }

  const rows: BandRow[] = bands.map((band) => {
    const recent = (history.get(band) ?? []).slice(-LEVEL_WINDOW)
    const s = recent.length
    const c = recent.filter(Boolean).length
    return {
      band,
      seen: s,
      correct: c,
      rate: s > 0 ? c / s : 0,
      status: statusOf(s, c),
      met: met.get(band) ?? 0,
      stable: stable.get(band) ?? 0,
    }
  })

  let solidThrough: Band | null = null
  for (const row of rows) {
    if (row.status !== 'solid') break
    solidThrough = row.band
  }

  return {
    bands: rows,
    solidThrough,
    edge: rows.find((r) => r.status === 'shaky')?.band ?? null,
    // 누적이다. 밴드 행의 `seen` 은 최근 `LEVEL_WINDOW` 로 잘려 있어 합과 다르다
    totalReadings,
  }
}
