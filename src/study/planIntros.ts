// 세션에서 "처음 만나는 숙어"를 골라 소개 자리로 바꾼다 (2026-09-13)
import type { SessionCard } from '../core/session.ts'

export interface IntroPlan {
  /** 실제로 낼 카드. 소개 대상 숙어는 한 장만 남는다 */
  cards: SessionCard[]
  /** 소개로 낼 숙어 id */
  introIds: Set<string>
}

/**
 * 처음 만나는 숙어(`due === false`, 아직 소개 안 함)를 소개 자리로 돌리고,
 * **그 숙어의 나머지 카드는 이번 세션에서 걷어낸다.**
 *
 * 걷어내는 이유 — 확장 숙어는 읽기·뜻 두 장이 같이 나오는데(`activeCardTypes`),
 * 소개에서 읽기와 뜻을 다 보여준 뒤 같은 세션에서 그걸 물으면 첫 채점이 부푼다.
 * 밴드 사다리가 최근 30회를 보므로(`LEVEL_WINDOW`) 그 부풀림이 바로 수준 판정을 흔든다.
 *
 * 세션 길이는 그만큼 짧아진다. 상한을 안 두는 대신 진행 막대가 처음부터 맞는 수를 쓴다 —
 * 중간에 카드를 건너뛰면 막대가 튄다.
 */
export function planIntros(
  cards: readonly SessionCard[],
  isIntroduced: (idiomId: string) => boolean,
): IntroPlan {
  const introIds = new Set<string>()
  for (const c of cards) {
    if (!c.due && !isIntroduced(c.idiomId)) introIds.add(c.idiomId)
  }

  const kept = new Set<string>()
  const out: SessionCard[] = []
  for (const c of cards) {
    if (introIds.has(c.idiomId)) {
      if (kept.has(c.idiomId)) continue
      kept.add(c.idiomId)
    }
    out.push(c)
  }

  return { cards: out, introIds }
}
