// 피드백을 받을 Google Apps Script 웹 앱 주소 (2026-09-13).
//
// 배포 절차 — 스프레드시트 → 확장 프로그램 → Apps Script → `docs/feedback-endpoint.md`
// 의 코드를 붙이고 「배포 → 새 배포 → 웹 앱」, 액세스 권한을 "모든 사용자" 로.
// 발급된 `https://script.google.com/macros/s/…/exec` 주소를 아래에 넣는다.
//
// 비어 있으면 피드백 화면이 전송 버튼 대신 "복사해서 보내기" 만 보여준다 —
// 주소를 안 넣었다고 화면이 깨지면 안 된다.
export const FEEDBACK_ENDPOINT = ''

/**
 * 우연히 주소를 긁은 봇을 거르는 표식.
 *
 * **비밀이 아니다.** 앱이 정적 번들이라 파일을 열면 이 문자열이 그대로 보인다.
 * 작정하고 보내는 사람은 못 막는다 — 막으려는 건 아무 데나 POST 해 보는 자동 요청뿐이다.
 * 그래서 `.env` 로 뺄 이유도 없다. 비밀로 오해하고 감추려 들면 오히려 헷갈린다.
 *
 * 장난이 실제로 들어오면 이 값을 바꾸고 Apps Script 쪽도 같이 바꾼 뒤 다시 배포한다.
 */
export const FEEDBACK_TOKEN = 'yomenai-tester-2026'

/**
 * Apps Script 웹 앱은 리다이렉트를 거쳐 응답하고 그쪽엔 CORS 헤더가 없다.
 * 그래서 `no-cors` 로 보내고 **성공 여부를 읽을 수 없다.** 화면은 그 사실을 숨기지 않고,
 * 보낸 뒤에도 복사 경로를 함께 남긴다.
 */
export async function sendFeedback(text: string): Promise<void> {
  await fetch(FEEDBACK_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    // text/plain 이라야 프리플라이트가 안 붙는다 (Apps Script 는 OPTIONS 를 안 받는다)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: FEEDBACK_TOKEN, text }),
  })
}
