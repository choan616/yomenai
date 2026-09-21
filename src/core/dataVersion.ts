// 사용자 데이터가 바뀐 횟수. 화면이 파생값을 캐시할 때 무효화 키로 쓴다 (2026-09-21)
//
// 홈·리포트는 탭을 옮길 때마다 언마운트되고, 다시 들어오면 `listEvents` → `replay` →
// `buildSession`(후보 16,959개)을 처음부터 다시 돌았다. 그 사이가 2단계 렌더가 되어
// 화면이 튀었다 (사용자 지적). 결과를 캐시하되 **기록이 바뀌면 반드시 버린다.**
//
// 시각(now)은 세지 않는다 — 카드가 기한을 넘기는 건 분 단위 사건이라 앱을 켜 둔 동안
// 미리보기 숫자가 한 장 어긋나는 것은 감수한다. 세션을 마치면 이벤트가 쌓여 어차피 오른다.

let version = 0

/** 지금 버전. 캐시한 값과 이 값이 다르면 다시 계산한다 */
export function dataVersion(): number {
  return version
}

/**
 * 사용자 데이터를 바꿨다고 알린다. 이벤트 쓰기(`db/events.ts`)와 설정 저장에서 부른다.
 * 설정도 세는 이유는 `sessionLimit`·`ratio` 가 홈 미리보기를 바꾸기 때문이다.
 */
export function bumpDataVersion(): void {
  version++
}
