// 검수 모드 — 뜻 검수를 이 기기에서 열지 (2026-09-24 사용자 요청 「검수를 원격으로」)
//
// **인증이 아니다.** 검수 결과는 내가 내 Drive 파일을 내려받아 빌드에 넣을 때만 사전에
// 닿는다 — 남이 무엇을 눌러도 그 사람 Drive 에만 쌓인다. 그래서 여기서 가리는 것은
// 보안이 아니라 정돈이다: 보통 학습자에게 검수 도구를 안 보여 주는 것까지가 목적이다.
//
// 메일 계정으로 가르는 안은 접었다 — 지금 OAuth 스코프는 `drive.file` 하나뿐이라 앱이
// 로그인 메일을 모른다. `email` 을 더하면 동의 화면에 「이메일 주소 보기」가 늘고 그건
// 백업 쓰는 **모든 사람**이 본다. 토글 하나 감추자고 치를 값이 아니다 (사용자 판정).
//
// 그래서 **기기별**이다. 테마·글자 크기처럼 localStorage 에 두고 동기화하지 않는다 —
// 검수는 내 폰에서 하는 일이지 계정에 딸린 권한이 아니다.
const KEY = 'yomenai:reviewMode'

export function loadReviewMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function saveReviewMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 세션 한정
  }
}

/** 숨은 진입을 여는 데 필요한 길게 누르기 (ms). 실수로 안 열릴 만큼은 길게 */
export const UNLOCK_HOLD_MS = 1200
