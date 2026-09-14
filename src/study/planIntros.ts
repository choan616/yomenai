// 세션에서 "처음 만나는 숙어"를 골라 소개 자리로 바꾼다 (2026-09-13)
import type { SessionCard } from '../core/session.ts'

/**
 * 소개를 시작하기 전에 필요한 읽기 채점 수 (사용자 결정 2026-09-13).
 *
 * **처음부터 설명하지 않는다.** 기록이 없으면 앱은 이 사람이 뭘 아는지 모른다 —
 * 그 상태에서 "알아 두기" 를 내미는 건 아는 단어까지 가르치겠다는 뜻이다.
 * 먼저 레벨 테스트처럼 풀게 해서 데이터를 쌓고, 그 뒤부터 모르는 것만 설명한다.
 *
 * 값은 `PRESCRIPTION_MIN_READINGS` 와 같다 — "이만큼은 풀어야 신호로 읽는다" 는
 * 같은 논리다. 두 곳이 독립된 판단이라 상수도 따로 두되 이유를 여기 적어 둔다.
 */
export const INTRO_MIN_READINGS = 30

/**
 * 한 세션에서 소개가 차지할 수 있는 몫 (2026-09-14).
 *
 * 상한이 없으면 **풀이 좁은 세션이 통째로 소개가 된다.** 집중 세션(한 쌍만 모아 풀기)은
 * 후보 대부분이 신규라 "기존 1장 + 나머지 전부 알아 두기" 가 실제로 나왔다.
 * 소개는 가르치는 자리지 연습하는 자리가 아니라, 세션이 소개로 채워지면 연습이 사라진다.
 *
 * 상한을 넘은 신규 숙어는 **걷어내지 않고 그냥 출제한다.** 걷어내면 세션이 짧아지는데,
 * 풀이 좁은 세션에서는 몇 장 안 남아 세션 자체가 무의미해진다. 모르는 숙어를 그냥 내는 건
 * 소개 기능이 생기기 전의 원래 동작이기도 하다.
 */
export const INTRO_MAX_SHARE = 1 / 3

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
 *
 * `readings` 가 `INTRO_MIN_READINGS` 미만이면 소개를 아예 안 낸다 — 위 상수 참조.
 * 소개 수는 INTRO_MAX_SHARE 로 제한하고, 넘친 신규 숙어는 그냥 출제된다.
 */
export function planIntros(
  cards: readonly SessionCard[],
  isIntroduced: (idiomId: string) => boolean,
  /**
   * 이 숙어를 **한 번이라도 풀어 봤나.** due 로는 못 판단한다 — due 는
   * (숙어, 카드종류) 단위라, 읽기로 풀어 본 숙어의 뜻 카드가 처음 나오면
   * due === false 가 되어 숙어 전체가 신규로 보인다. 그러면 이미 푼 표현에
   * 「알아 두기」가 붙는다 (2026-09-14).
   */
  hasHistory: (idiomId: string) => boolean,
  readings: number,
): IntroPlan {
  // 아직 이 사람을 모른다 — 설명 대신 풀게 한다 (레벨 테스트 구간)
  if (readings < INTRO_MIN_READINGS) return { cards: [...cards], introIds: new Set() }

  const cap = Math.max(1, Math.floor(cards.length * INTRO_MAX_SHARE))
  const introIds = new Set<string>()
  for (const c of cards) {
    if (introIds.size >= cap) break
    // c.due 는 그 자체로 기록이 있다는 뜻이라 hasHistory 와 겹치지만, 기한 카드가
    // 소개로 바뀌는 일은 없어야 해서 판정자와 무관하게 여기서 막는다
    if (!c.due && !hasHistory(c.idiomId) && !isIntroduced(c.idiomId)) introIds.add(c.idiomId)
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
