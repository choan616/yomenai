// 세션 끝의 예고 한 줄 — 끝맺지 않고 남겨두는 쪽이 돌아오게 만든다.
// 보상이 아니라 약속이라 "발견" 축을 벗어나지 않는다 (context-notes 2026-09-07)
import type { OnyomiPair } from '../dict/load.ts'
import type { CardType } from './types.ts'

/** 이만큼은 겹쳐야 예고할 값이 있다. 한 번 나오는 음독을 예고하면 그냥 카드 목록이다 */
export const NEXTUP_MIN_COUNT = 2

export interface NextUp {
  pairId: string
  kanji: string
  base: string
  kind: 'on' | 'kun'
  /** 다음 세션에서 이 음독을 만나는 횟수 */
  count: number
}

/**
 * 다음 세션에서 가장 자주 만날 (한자, 음독) 쌍.
 *
 * 다음 세션을 실제로 한 번 짜서 세므로 예고가 빗나가지 않는다. 제시 *순서*는 매 세션
 * 시드로 섞이지만 *어떤* 카드가 뽑히는지는 안 바뀌기 때문이다 (`SelectOptions.seed` 주석).
 *
 * 읽기 카드만 센다 — 뜻 카드는 음독을 묻지 않는다.
 */
export function nextUp(
  cards: readonly { idiomId: string; cardType: CardType }[],
  pairsOf: (idiomId: string) => string[],
  pairs: Map<string, OnyomiPair>,
): NextUp | null {
  const counts = new Map<string, number>()
  for (const c of cards) {
    if (c.cardType !== 'reading') continue
    for (const pid of pairsOf(c.idiomId)) counts.set(pid, (counts.get(pid) ?? 0) + 1)
  }

  let best: { pairId: string; count: number } | null = null
  for (const [pairId, count] of counts) {
    if (!pairs.has(pairId)) continue
    if (best === null || count > best.count || (count === best.count && pairId < best.pairId)) {
      best = { pairId, count }
    }
  }
  if (best === null || best.count < NEXTUP_MIN_COUNT) return null

  const p = pairs.get(best.pairId)!
  return { pairId: best.pairId, kanji: p.kanji, base: p.base, kind: p.kind, count: best.count }
}
