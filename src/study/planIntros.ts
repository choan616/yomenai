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
 */
export function planIntros(
  cards: readonly SessionCard[],
  isIntroduced: (idiomId: string) => boolean,
  readings: number,
): IntroPlan {
  // 아직 이 사람을 모른다 — 설명 대신 풀게 한다 (레벨 테스트 구간)
  if (readings < INTRO_MIN_READINGS) return { cards: [...cards], introIds: new Set() }

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
