// 한 한자가 코퍼스에서 실제로 쓰는 다른 음독을 찾는다 — 대조 세션의 표적을 정하는 부분 (2026-09-21).
//
// 오음·한음 층위는 안 쓴다. 출처(KANJIDIC2)가 `ja_on` 을 한 덩어리로 주고, 층위를 알아도
// 다음 숙어의 읽기를 고르는 근거가 안 된다 (context-notes 같은 날). 층위 이름 없이
// **음독이 둘이라는 사실**만으로 人間 にん ↔ 人口 じん 을 나란히 낼 수 있다.
import { parsePairId } from '../lib/onyomi.ts'

/**
 * 형제 음독으로 치는 최소 숙어 수. 이보다 적으면 번갈아 낼 것이 없어 대조가 안 선다.
 *
 * 3 에서 음독이 둘 이상인 한자가 114 자이고 **셋 이상인 한자는 없다** — 그래서 형제 수
 * 상한이라는 값을 따로 안 만든다 (context-notes 2026-09-21 실측표).
 */
export const CONTRAST_MIN_IDIOMS = 3

export interface SiblingOnyomi {
  pairId: string
  base: string
  /** 그 음독을 쓰는 숙어 수 */
  idioms: number
}

/**
 * `pairId` 와 같은 한자의 **다른 음독**을 숙어 수가 많은 순으로 낸다.
 *
 * 훈독은 안 섞는다 — 훈독까지 끌어오면 대조가 아니라 혼독 수업이 되고, 그건 `mixed` 절이
 * 맡는 다른 문제다. 자기 자신과 `CONTRAST_MIN_IDIOMS` 미만도 뺀다.
 *
 * `countOf` 는 pairId → 그 쌍을 쓰는 숙어 수다 (`prescribe` 의 `unlocksOf` 와 같은 값).
 * 후보 쌍 목록을 부르는 쪽이 주므로 이 함수는 사전을 안 읽는다.
 */
export function onyomiSiblings(
  pairId: string,
  allPairIds: Iterable<string>,
  countOf: (pairId: string) => number,
): SiblingOnyomi[] {
  const self = parsePairId(pairId)
  if (self === null || self.kind !== 'on') return []

  const out: SiblingOnyomi[] = []
  const seen = new Set<string>([pairId])
  for (const id of allPairIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const p = parsePairId(id)
    if (p === null || p.kind !== 'on' || p.kanji !== self.kanji) continue
    const idioms = countOf(id)
    if (idioms < CONTRAST_MIN_IDIOMS) continue
    out.push({ pairId: id, base: p.base, idioms })
  }

  out.sort((a, b) => b.idioms - a.idioms || (a.pairId < b.pairId ? -1 : 1))
  return out
}
