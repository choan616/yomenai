// 세션 루프 안에서 스치는 관찰 한 줄 (Phase 9-C). 세션 요약의 Finding 을 카드 단위로 좁힌 것.
// 지금은 한 종류 — "지난번엔 틀렸던 음독을 이번엔 맞혔다". 격려가 근거에 붙어 있어야 한다.
import { parsePairId } from '../lib/onyomi.ts'
import type { LearningEvent, OnyomiStat } from './types.ts'

export interface Observation {
  kind: 'WEAK_ONYOMI_RECOVERED'
  kanji: string
  base: string
  onKind: 'on' | 'kun'
  /** 이 카드 전까지 이 음독을 틀린 횟수 */
  priorWrong: number
}

export interface ObserveInput {
  /** 방금 맞힌 숙어의 (한자, 음독) 쌍 id */
  pairIds: string[]
  /** 세션 시작 시점의 음독 집계 */
  before: Map<string, OnyomiStat>
  /** 이번 세션에서 이미 기록한 이벤트 (이 카드는 아직 안 들어 있다) */
  sessionEvents: LearningEvent[]
  pairsOf: (idiomId: string) => string[]
}

/**
 * 방금 읽기를 *맞힌* 직후에만 부른다. 이 숙어의 음독 중 이력이 나빴던(오답 ≥ 2, 오답 > 정답)
 * 게 있으면 그중 가장 나빴던 하나를 돌려준다. 없으면 null.
 * 전체 로그 재생 없이 (before 집계 + 이번 세션 누적)으로 센다 — echo 와 같은 경로.
 */
export function observeReading(input: ObserveInput): Observation | null {
  const sessSeen = new Map<string, number>()
  const sessWrong = new Map<string, number>()
  for (const e of input.sessionEvents) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    for (const pid of input.pairsOf(e.idiomId)) {
      sessSeen.set(pid, (sessSeen.get(pid) ?? 0) + 1)
      if (!e.correct) sessWrong.set(pid, (sessWrong.get(pid) ?? 0) + 1)
    }
  }

  let best: Observation | null = null
  const seen = new Set<string>()
  for (const pid of input.pairIds) {
    if (seen.has(pid)) continue
    seen.add(pid)
    const p = parsePairId(pid)
    if (p === null) continue

    const priorSeen = (input.before.get(pid)?.seen ?? 0) + (sessSeen.get(pid) ?? 0)
    const priorWrong = (input.before.get(pid)?.wrong ?? 0) + (sessWrong.get(pid) ?? 0)
    const priorCorrect = priorSeen - priorWrong

    if (priorWrong >= 2 && priorWrong > priorCorrect) {
      if (!best || priorWrong > best.priorWrong) {
        best = { kind: 'WEAK_ONYOMI_RECOVERED', kanji: p.kanji, base: p.base, onKind: p.kind, priorWrong }
      }
    }
  }
  return best
}
