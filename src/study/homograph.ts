// 동형이독(같은 표기, 다른 읽기) 처리 — 「읽기 둘」 카드가 짝을 찾고 세션을 접는 곳 (2026-09-14)

/** 표기와 읽기만 있으면 된다 — 사전 레코드 전체를 요구하지 않으려고 좁게 받는다 */
export interface HomographCandidate {
  idiomId: string
  headword: string
  reading: string
}

/**
 * 같은 표기를 쓰는 *다른* 숙어. 있으면 이 카드는 「읽기 둘」 카드가 된다.
 *
 * 답을 안 보고 표기만으로 정한다 — 이어 묻기가 **다른 읽기를 썼을 때만** 발동하던 것이
 * 문제였다. 그러면 같은 실력이 순서에 따라 다르게 처리되고, 맞는 읽기를 쓰고도 카드가
 * 오답이 되는 일이 생긴다 (사용자 지적 2026-09-14). 처음부터 둘 다 묻는다.
 */
export function pairOf(
  idiom: { idiomId: string; headword: string },
  sameHeadword: HomographCandidate[] | undefined,
): HomographCandidate | undefined {
  return (sameHeadword ?? []).find((x) => x.idiomId !== idiom.idiomId)
}

/**
 * 세션 카드에서 같은 표기의 읽기 카드를 한 장으로 접는다.
 *
 * 접지 않으면 방금 「읽기 둘」 로 다 물어본 표기가 세션 뒤에 또 나온다 — 상대 숙어도
 * 후보 풀에 있기 때문이다. 뜻 카드는 안 건드린다 (뜻은 서로 다를 수 있다).
 */
export function foldHomographs<T extends { idiomId: string; cardType: string }>(
  cards: T[],
  headwordOf: (idiomId: string) => string | undefined,
): T[] {
  const seen = new Set<string>()
  return cards.filter((c) => {
    if (c.cardType !== 'reading') return true
    const hw = headwordOf(c.idiomId)
    if (hw === undefined) return true
    if (seen.has(hw)) return false
    seen.add(hw)
    return true
  })
}
