# 피드백 수신 — Google Apps Script

테스터 피드백을 본인 구글 스프레드시트로 받는 절차. 한 번만 하면 된다.

앱은 **학습 기록을 보내지 않는다.** 테스터가 화면에 적은 답만 텍스트로 간다
(`src/app/Feedback.tsx`).

## 1. 스프레드시트와 스크립트

1. 새 스프레드시트를 만든다 (이름은 아무거나)
2. **확장 프로그램 → Apps Script**
3. 기본 코드를 지우고 아래를 붙인다

```js
// 앱이 보내는 표식. src/app/feedbackEndpoint.ts 의 FEEDBACK_TOKEN 과 같아야 한다
const TOKEN = 'yomenai-tester-2026'

function doPost(e) {
  let body
  try {
    body = JSON.parse(e.postData.contents)
  } catch (err) {
    return ContentService.createTextOutput('bad')
  }
  // 우연히 주소를 긁은 자동 요청을 거른다. 비밀이 아니라 표식일 뿐이다
  if (!body || body.token !== TOKEN) return ContentService.createTextOutput('no')

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
  if (sheet.getLastRow() === 0) sheet.appendRow(['받은 시각', '내용'])
  sheet.appendRow([new Date(), body.text])
  return ContentService.createTextOutput('ok')
}
```

내용을 한 칸에 통째로 넣는다. 문항이 바뀌어도 스크립트를 안 고쳐도 되고,
읽을 때 칸 하나만 보면 된다.

`TOKEN` 은 **비밀이 아니다.** 앱이 정적 번들이라 파일을 열면 그대로 보인다.
막으려는 건 아무 데나 POST 해 보는 자동 요청이지 작정한 사람이 아니다.
장난이 실제로 들어오면 양쪽 값을 같이 바꾸고 다시 배포한다.

## 2. 배포

**배포 → 새 배포 → 유형 「웹 앱」**

| 항목 | 값 |
|---|---|
| 실행 계정 | 나 |
| 액세스 권한 | **모든 사용자** |

「모든 사용자」여야 로그인 안 한 테스터도 보낼 수 있다.
처음 배포하면 권한 승인을 한 번 묻는다.

발급된 주소(`https://script.google.com/macros/s/…/exec`)를
[`src/app/feedbackEndpoint.ts`](../src/app/feedbackEndpoint.ts) 의 `FEEDBACK_ENDPOINT` 에 넣고 배포한다.

## 3. 알아 둘 것

**전송 성공을 확인할 수 없다.** Apps Script 웹 앱은 리다이렉트를 거쳐 응답하는데 그쪽에
CORS 헤더가 없다. 그래서 `no-cors` 로 보내고 결과를 못 읽는다. 화면은 이 사실을 숨기지
않고, 보낸 뒤에도 「내용 복사」 경로를 함께 남긴다.

**주소를 안 넣으면 전송 버튼이 안 뜬다.** 대신 「내용 복사」만 보인다 —
설정이 덜 됐다고 화면이 깨지면 안 된다.

**표식이 안 맞으면 조용히 버린다.** 시트에 아무 줄도 안 생긴다. 테스트할 때 줄이 안 보이면
`TOKEN` 양쪽이 같은지부터 확인한다.

**코드를 고치면 새 배포가 필요하다.** 「배포 관리」에서 기존 배포를 수정해야 주소가 유지된다.
새로 만들면 주소가 바뀌어 앱도 같이 고쳐야 한다.

## 문항

`Feedback.tsx` 가 보내는 내용. 바꾸려면 그 파일의 `compose` 와 화면을 같이 고친다.

```
[얼마나 썼나]        직접 입력
[가장 큰 오답 유형]   한국음 간섭 / 음독 선택 / 연탁 / 촉음 / 장음 / 음훈 혼독 / 모르겠어요
[밴드 사다리]        맞다 / 쉬운데 흔들림 / 어려운데 안정 / 모르겠어요
[처음 30문항]        서술
[알아 두기 카드]      서술
[계속 쓰고 싶은지]    서술
[이상했던 곳]         서술
```

「가장 큰 오답 유형」은 이 기기 기록으로 계산한 값을 **화면에 보여만 준다.**
고르는 건 테스터고, 고른 값만 전송된다.
