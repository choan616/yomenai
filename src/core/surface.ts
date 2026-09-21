// (한자, 음독) 쌍이 어떤 숙어에서 실제로 어떤 표면형으로 나타났는지.
// 대조(변형된 것 ↔ 안 된 것)를 세우려면 기준이 원형이 아니라 표면형이어야 한다 —
// 発 はつ 하나로는 発達 はっ / 発言 はつ 가 갈리지 않는다 (context-notes 2026-09-07)
import { decompose, pairId as makePairId, type KanjiReadings } from '../lib/onyomi.ts'

/**
 * Phase 2 의 최소 비용 분해를 그대로 쓴다 (`rubyOf` 와 같은 경로).
 * 분해에 실패하거나(熟字訓 등) 그 쌍이 이 숙어에 없으면 null.
 * 같은 쌍이 한 숙어에 두 번 나오면 앞자리를 쓴다 — 대조에는 한 자리면 충분하다.
 */
export function surfaceOfPair(
  headword: string,
  reading: string,
  targetPairId: string,
  lookup: (kanji: string) => KanjiReadings | undefined,
): string | null {
  return surfaceOfPairs(headword, reading, [targetPairId], lookup)
}

/**
 * 표적이 여럿일 때 — 대조 세션이 쓴다 (2026-09-21).
 *
 * 한 숙어에는 표적 중 **하나만** 들어 있는 것이 보통이라(人間 은 にん, 人口 는 じん)
 * 먼저 만나는 자리를 쓴다. 이 값이 곧 번갈아 낼 그룹의 키가 되므로, 표면형을 그대로
 * 돌려주면 쌍 사이 대조와 쌍 안 대조가 같은 키로 처리된다 (`FocusOptions.surfaceOf`).
 */
export function surfaceOfPairs(
  headword: string,
  reading: string,
  targetPairIds: Iterable<string>,
  lookup: (kanji: string) => KanjiReadings | undefined,
): string | null {
  const targets = new Set(targetPairIds)
  const d = decompose(headword, reading, lookup)
  if (!d.ok) return null
  for (const s of d.segments) {
    if (targets.has(makePairId(s.kanji, s.base, s.kind))) return s.surface
  }
  return null
}
