// 「바로잡은 표현」 판정과 세션 요약용 누적·증가 수 — 상습이 된 읽기 표현이 시간을 두고 연달아 맞혀진 것만 센다 (PLAN §11 D3 K5·S2·D5)
import { compareEvents, type LearningEvent, type ReviewEvent } from './types.ts'

/** 누적 오답이 이만큼이면 상습 표현으로 본다 */
export const CHRONIC_WRONG = 3
/** 상습이 된 뒤 마지막 오답 이후 이만큼 연속으로 맞혀야 한다 */
export const CORRECTED_STREAK = 2
/** 그 연속의 첫 정답에서 이만큼 지난 정답이어야 한다 — 같은 날 재출제로는 안 바로잡힌다 */
export const CORRECTED_SPAN_MS = 7 * 864e5

/** 마지막 오답 이후 연속 정답 `count` 회, 첫 정답에서 `spanMs` 지난 정답이 「바로잡았다」에 드는지 (K5) */
export function isCorrectedStreak(count: number, spanMs: number): boolean {
  return count >= CORRECTED_STREAK && spanMs >= CORRECTED_SPAN_MS
}

/** 읽기 채점만, 삭제 제외, 같은 id 한 번, 시간순 */
export function readingReviews(events: readonly LearningEvent[]): ReviewEvent[] {
  const seen = new Map<string, ReviewEvent>()
  for (const e of events) {
    if (e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null) seen.set(e.id, e)
  }
  return [...seen.values()].sort(compareEvents)
}

/**
 * 한 표현의 읽기 채점(시간순)에서 처음 바로잡힌 자리의 위치. 없으면 null.
 * 상습 여부는 **그 시점까지의 오답**으로만 가른다 — 나중에 상습이 될 표현의 초기 연속 정답은 안 센다.
 * 한 번 바로잡히면 이후에 다시 틀려도 이 위치는 그대로다(호출하는 쪽이 한 번만 센다).
 */
export function correctedIndex(list: readonly ReviewEvent[]): number | null {
  let wrongs = 0
  let count = 0
  let firstAt = 0
  for (let i = 0; i < list.length; i++) {
    const e = list[i]!
    if (!e.correct) {
      wrongs++
      count = 0
      continue
    }
    if (count === 0) firstAt = e.at
    count++
    if (wrongs >= CHRONIC_WRONG && isCorrectedStreak(count, e.at - firstAt)) return i
  }
  return null
}

/** 바로잡은 표현의 id 집합 */
export function correctedIds(events: readonly LearningEvent[]): Set<string> {
  const byIdiom = new Map<string, ReviewEvent[]>()
  for (const e of readingReviews(events)) {
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
  }
  const out = new Set<string>()
  for (const [id, list] of byIdiom) {
    if (correctedIndex(list) !== null) out.add(id)
  }
  return out
}

export interface CorrectedSummary {
  /** 지금까지 바로잡은 표현 수 (누적) */
  total: number
  /** 이번 세션 이벤트로 새로 바로잡은 수 */
  gained: number
}

/** `before` = 세션 전 이벤트 전부, `after` = 세션 뒤 이벤트 전부(`before` 포함) */
export function correctedSummary(
  before: readonly LearningEvent[],
  after: readonly LearningEvent[],
): CorrectedSummary {
  const was = correctedIds(before)
  const now = correctedIds(after)
  let gained = 0
  for (const id of now) if (!was.has(id)) gained++
  return { total: now.size, gained }
}
