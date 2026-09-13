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
 * Apps Script 웹 앱은 리다이렉트를 거쳐 응답하고 그쪽엔 CORS 헤더가 없다.
 * 그래서 `no-cors` 로 보내고 **성공 여부를 읽을 수 없다.** 화면은 그 사실을 숨기지 않고,
 * 보낸 뒤에도 복사 경로를 함께 남긴다.
 */
export async function sendFeedback(body: string): Promise<void> {
  await fetch(FEEDBACK_ENDPOINT, {
    method: 'POST',
    mode: 'no-cors',
    // text/plain 이라야 프리플라이트가 안 붙는다 (Apps Script 는 OPTIONS 를 안 받는다)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  })
}
