// 기능 잠금 — 연속 기록이 일정 기간에 닿으면 열린다 (2026-10-04 사용자 「끝말잇기는 레벨 제도를 도입하면 특정 레벨에서 오픈」 →
// 「내가 확인해야 하므로 연속 기록이 한 달이면 열리도록」)
//
// 열리는 조건은 여기 한 곳이다 — 화면은 `isUnlocked` 만 묻는다.
// **최장 연속(`longest`)으로 본다.** 현재 연속이 아니라서 한 번 닿으면 이후 끊겨도 열린 채다(열린 기능이 도로 잠기는 건 손실이고,
// `streak.ts` 의 「끊김은 말하지 않는다」와 어긋난다). 채점 로그에서 다시 세는 값이라 따로 저장하지 않고 백업을 복원해도 그대로다.
// 개발 빌드에서는 `localStorage['yomenai:unlock:<기능>'] = '1'` 로 열어 e2e 가 기능을 시험한다(프로덕션 빌드에서는 이 분기가 사라진다).

export type Unlockable = 'shiritori'

/**
 * 끝말잇기가 열리는 연속 일수. 「한 달」을 이정표 사다리의 4주(28일, `STREAK_MILESTONES`)로 읽었다 — 리포트에 「4주 연속」
 * 이정표가 뜨는 날 열리므로 두 사건이 어긋나지 않는다. 30일로 바꾸려면 이 숫자만 고친다
 */
export const SHIRITORI_STREAK_DAYS = 28

const THRESHOLD: Record<Unlockable, number> = { shiritori: SHIRITORI_STREAK_DAYS }

/** @param streak 리포트가 이미 세는 연속 기록. 아직 계산 전이면 null (잠긴 것으로 본다) */
export function isUnlocked(feature: Unlockable, streak: { longest: number } | null): boolean {
  if (import.meta.env.DEV) {
    try {
      if (localStorage.getItem(`yomenai:unlock:${feature}`) === '1') return true
    } catch {
      /* 저장소가 막혔으면 기록으로만 판정 */
    }
  }
  return streak !== null && streak.longest >= THRESHOLD[feature]
}
