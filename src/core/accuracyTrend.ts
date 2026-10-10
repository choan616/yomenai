// 읽기 정답률 추이 — 학습한 날마다 「그날까지의 판정 창」 정답률 (리포트 수준 시트의 선 그래프)
//
// **값의 정의는 수준 표의 「최근 정답률」과 같다** (`selectWindow`: 최근 7일, 모자라면 최근 100회). 그래서 이 선의
// 마지막 점이 표의 숫자와 같고, 선은 「그 숫자가 날마다 어떻게 움직였나」다. 일간 정답률은 쓰지
// 않는다 — 하루 표본이 적어 점이 튀고, 정답률은 순간 상태라 표본이 흔들면 같이 뒤집힌다
// (2026-09-22 막대를 정답률로 쓰자는 안을 기각한 이유와 같다).
import { dateKey, shiftDateKey } from './attendance.ts'
import { LEVEL_MAX_BAND, selectWindow, type WindowEntry } from './level.ts'
import { compareEvents, type LearningEvent } from './types.ts'
import type { Band } from '../lib/bands.ts'

/** 그래프가 보여 주는 기간(일). 오늘 포함 */
export const TREND_DAYS = 28
/**
 * 점을 찍는 데 필요한 최소 창 크기. 판정(`LEVEL_MIN_GRADES`)만큼 엄격하지 않다 — 이 선은 판정이 아니라
 * 움직임을 보여 주는 것이고, 판정 문턱을 넘기 전의 초반 기록도 보여 줄 만하다
 */
export const TREND_MIN_POINTS = 30

export interface TrendPoint {
  /** 로컬 날짜 키 `YYYY-MM-DD` */
  date: string
  /** 그날 끝 기준 판정 창의 정답률 (0~1) */
  rate: number
  /** 그 정답률에 든 채점 수 */
  n: number
}

/** 'all' = 코스 0~3 합산, 숫자 = 그 코스만 */
export type TrendKey = 'all' | Band

/**
 * 계열별 점. **학습한 날에만** 점이 있다 — 쉰 날은 값이 안 바뀌므로 비워 두고, 그림은 날짜 위치에
 * 맞춰 이어 그린다. 창이 `TREND_MIN_POINTS` 회 미만인 동안은 점이 없다.
 * 코스 계열은 그 코스를 채점한 날에만 점이 생긴다.
 */
export type AccuracyTrends = Map<TrendKey, TrendPoint[]>

export function accuracyTrends(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
  today: string = dateKey(Date.now()),
): AccuracyTrends {
  const from = shiftDateKey(today, -(TREND_DAYS - 1))
  const history = new Map<TrendKey, WindowEntry[]>()
  const out: AccuracyTrends = new Map()
  /** 오늘 하루 동안 값이 바뀐 계열 — 날이 바뀔 때 점을 찍는다 */
  let touched = new Set<TrendKey>()
  let day: string | null = null

  const settle = (date: string) => {
    if (date < from || date > today) return
    for (const key of touched) {
      const win = selectWindow(history.get(key)!)
      if (win.length < TREND_MIN_POINTS) continue
      const list = out.get(key) ?? []
      list.push({ date, rate: win.filter((w) => w.correct).length / win.length, n: win.length })
      out.set(key, list)
    }
  }

  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    // 수준 지표와 같은 범위 — 코스 4(담은 것만)는 판정·합계·그래프에서 뺀다 (2026-09-26 판단)
    if (band === undefined || band > LEVEL_MAX_BAND) continue
    const key = dateKey(e.at)
    if (day !== null && key !== day) {
      settle(day)
      touched = new Set()
    }
    day = key
    const entry: WindowEntry = { date: key, correct: e.correct, idiomId: e.idiomId }
    for (const k of ['all', band] as const) {
      const w = history.get(k)
      if (w) w.push(entry)
      else history.set(k, [entry])
      touched.add(k)
    }
  }
  if (day !== null) settle(day)
  return out
}
