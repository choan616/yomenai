// 답에 한글이 섞였는지 본다. 읽기 입력이 채점 전에 거르는 용도다 (2026-09-19).
//
// 웹에는 키보드 **언어**를 지정하는 수단이 없다 — `inputMode` 는 종류(url·email·numeric)를
// 고를 뿐이고, `lang` 은 콘텐츠 언어 힌트라 키보드 선택에 안 쓰인다. iOS 는 마지막에 쓴
// 키보드를 기억하고 지구본 키로 사용자가 바꾸므로, 한글 키보드가 뜬 채로 치는 일이 생긴다.
// 그대로 제출되면 wanakana 가 변환을 못 해 오답으로 기록되고 오답 유형 분포와 복습 일정까지
// 틀어진다. 네이티브의 `UIKeyboardType.asciiCapable` 같은 강제 수단이 웹엔 없어서 값으로 막는다.

/** 완성형 음절 · 호환 자모(ㄱ·ㅏ) · 조합 자모(조합 중인 글자) */
const HANGUL = /[가-힣ㄱ-ㆎᄀ-ᇿ]/

export function hasHangul(value: string): boolean {
  return HANGUL.test(value)
}
