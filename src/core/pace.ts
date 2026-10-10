// 응답 시간을 읽어 "맞지만 느린" 카드를 가려내는 순수 함수 (2026-10-07, 교수자 관점 보완 A1).
//
// `ReviewEvent.elapsedMs` 는 v1부터 모든 채점에 기록되는데 읽는 코드가 없었다. 정확도는
// 지식의 유무를, 응답 시간은 자동화 여부를 잰다 — 맞지만 느린 것은 노출 반복이 필요하고
// 틀리고 빠른 것은 대조가 필요해 처방이 반대다 (decisions.md 「처방 — 규칙 축에도 대조를
// 연다」). 이 단계는 화면을 건드리지 않는다.
import type { Confidence } from './scheduler.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

/** 이만큼 정답 표본이 안 모이면 null (판정 보류) */
export const PACE_MIN_SAMPLE = 20
/** 정답 응답 시간 중앙값의 몇 배부터 "느린" 인가 */
export const PACE_SLOW_FACTOR = 2
/** 이보다 긴 이벤트는 버린다 (중간에 멈춘 것) */
export const PACE_CAP_MS = 60_000

export interface PaceProfile {
  /** 정답 응답 시간 중앙값 (ms) */
  medianMs: number
  /** 맞았지만 느린 카드. 느린 순서 */
  slow: { idiomId: string; elapsedMs: number }[]
  /**
   * 비율의 분모 — 중앙값을 낸 정답 표본 수(숙어당 최근 1건).
   * 화면이 「정답 중 N%」를 말하려면 분모가 있어야 한다. 개수만 내면 많은지 적은지를 못 읽는다
   * (사용자 2026-10-07 「내 수준이 어느 정도인지 알기 어렵다」)
   */
  counted: number
}

/** 짝수 개면 가운데 둘의 평균. `tools/audit-pace.ts` 가 예측 타당도 실측에도 같은 중앙값을 쓴다 */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * 정답의 등급을 응답 시간에서 정한다 (2026-10-10 사용자 결정 — 「쉬웠다·헷갈렸다」 버튼을 없앴다).
 *
 * 평소(`medianMs`)의 `PACE_SLOW_FACTOR` 배 넘게 걸린 정답은 Hard, 나머지는 Good(= null) 이다.
 * **Easy 는 쓰지 않는다** — 버튼이 있던 때 정답의 99% 가 「쉬웠다」였고, 그 표현이 더 덜 맞았다
 * (다음 복습 정답률 66% vs 80%). 평소 기준이 없거나(표본 부족) 중간에 멈춘 응답(`PACE_CAP_MS` 초과)이면
 * 판단하지 않는다.
 */
export function autoConfidence(elapsedMs: number, medianMs: number | null): Confidence {
  if (medianMs === null || elapsedMs <= 0 || elapsedMs > PACE_CAP_MS) return null
  return elapsedMs >= medianMs * PACE_SLOW_FACTOR ? 'hard' : null
}

/**
 * 읽기 카드의 응답 시간 분포를 낸다.
 *
 * 같은 숙어가 여러 번 나오면 **가장 최근 이벤트**로 한 번만 센다 — 옛 기록이 지금 상태를
 * 덮으면 느려진 것도 빨라진 것도 안 보인다. 중앙값·`slow` 모두 이 대표 이벤트 집합에서 낸다.
 */
export function paceProfile(events: readonly LearningEvent[]): PaceProfile | null {
  const latestByIdiom = new Map<string, ReviewEvent>()
  for (const e of events) {
    if (e.type !== 'review' || e.deletedAt !== null || e.cardType !== 'reading') continue
    if (e.elapsedMs <= 0 || e.elapsedMs > PACE_CAP_MS) continue
    const cur = latestByIdiom.get(e.idiomId)
    if (cur === undefined || e.at > cur.at || (e.at === cur.at && e.id > cur.id)) {
      latestByIdiom.set(e.idiomId, e)
    }
  }

  const correctMs: number[] = []
  for (const e of latestByIdiom.values()) {
    if (e.correct) correctMs.push(e.elapsedMs)
  }
  if (correctMs.length < PACE_MIN_SAMPLE) return null

  const medianMs = median(correctMs)
  const slow: { idiomId: string; elapsedMs: number }[] = []
  for (const e of latestByIdiom.values()) {
    if (e.correct && e.elapsedMs >= medianMs * PACE_SLOW_FACTOR) {
      slow.push({ idiomId: e.idiomId, elapsedMs: e.elapsedMs })
    }
  }
  slow.sort((a, b) => b.elapsedMs - a.elapsedMs || (a.idiomId < b.idiomId ? -1 : a.idiomId > b.idiomId ? 1 : 0))

  return { medianMs, slow, counted: correctMs.length }
}
