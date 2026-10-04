// 기능 잠금 — 레벨 제도가 생기면 특정 레벨에 도달한 사용자에게 열린다 (2026-10-04 사용자 「끝말잇기는 추후에 레벨제도를 도입하면 특정 레벨에 도달하면 오픈되는 기능」)
//
// 레벨 제도가 아직 없어서 지금은 모두 잠겨 있다. 열리는 조건은 여기 한 곳에서 바꾼다 — 화면은 `isUnlocked` 만 묻는다.
// 개발 빌드에서는 `localStorage['yomenai:unlock:<기능>'] = '1'` 로 열어 e2e 가 기능을 시험한다(프로덕션 빌드에서는 이 분기가 사라진다).

export type Unlockable = 'shiritori'

export function isUnlocked(feature: Unlockable): boolean {
  if (import.meta.env.DEV) {
    try {
      if (localStorage.getItem(`yomenai:unlock:${feature}`) === '1') return true
    } catch {
      /* 저장소가 막혔으면 잠금 그대로 */
    }
  }
  return false
}
