// 사용 안내서(public/guide.html)를 여는 한 곳 (2026-09-13). 홈과 설정 두 군데서 부른다.
//
// `_blank` 로 열지만 **홈 화면에 설치한 앱에서는 브라우저로 안 빠지고 그 자리에서 열린다.**
// 주소창도 뒤로가기도 없어 갇히므로, 안내서 자신이 「앱으로 돌아가기」 를 들고 있다
// (public/guide.html 의 `.backbar`). 둘은 같이 움직여야 한다.
//
// BASE_URL 로 붙인다 — dev 는 '/', 배포는 '/yomenai/' 라 문자열을 박으면 한쪽이 깨진다.
export function openGuide(): void {
  window.open(`${import.meta.env.BASE_URL}guide.html`, '_blank', 'noopener')
}
