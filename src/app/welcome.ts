// 첫 안내를 봤는지 기록한다 (테스터 피드백 2026-09-14).
//
// **이벤트 로그가 아니다** — 학습 기록이 아니라 화면 진행 상태라 스키마를 안 건드린다
// (`introduced.ts`·`diagnostic-state.ts` 와 같은 관례). 기기 간 동기화가 안 되는 건
// 알고 받는 값이다. 다른 기기에서 안내를 한 번 더 보는 건 손해가 아니다.
const KEY = 'yomenai:welcomeSeen'

export function isWelcomeSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // 프라이빗 모드 등 — 읽기가 막히면 안내를 다시 보여준다. 안 보여주는 것보다 낫다
    return false
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 저장 실패 시 다음 진입에서 다시 뜬다. 화면이 깨지지는 않는다
  }
}

/** 학습 기록 초기화가 부를 자리 — 기록을 지웠으면 첫 진입도 처음부터다 */
export function clearWelcomeSeen(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 무시
  }
}
