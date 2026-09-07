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
  const d = decompose(headword, reading, lookup)
  if (!d.ok) return null
  for (const s of d.segments) {
    if (makePairId(s.kanji, s.base, s.kind) === targetPairId) return s.surface
  }
  return null
}
