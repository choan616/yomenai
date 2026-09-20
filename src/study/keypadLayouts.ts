// 로마자 자판 배열 (2026-09-20 사용자 요청 "안 쓰는 키를 없애면 더 크게 쓸 수 있겠다").
//
// **실측 근거** — 밴드 0~4 읽기 102,377개를 로마자로 펴서 글자를 세니 `l` `q` `v` `x` 는
// **0회**다 (`tools/measure-romaji-letters.ts`). 대체 표기도 안전하다: し를 si, つ를 tu,
// ち를 ti, ふ를 hu 로 쳐도 전부 남는 글자로 된다. x·l 은 wanakana 의 작은 가나 접두사인데
// っ 는 자음 겹침으로, ゃゅょ 는 kya 로 나오니 쓸 일이 없다.
//
// 그래서 22자로 줄이면 키가 커진다. 다만 **줄여 얻는 폭과 잃는 위치 기억이 맞바꿈**이라
// 설정으로 고르게 했다.

export type KeypadLayout = 'qwerty' | 'compact' | 'wide'

/** 자판에 그릴 글자 줄. 마지막 줄 오른쪽에 ⌫ 가 붙는다 */
export const KEYPAD_ROWS: Record<KeypadLayout, readonly string[]> = {
  /** 26키. 물리 키보드와 같은 자리 */
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  /** 22키. 안 쓰는 넷만 빼고 **자리는 그대로** — 손가락이 기억한 위치가 거의 살아 있다 */
  compact: ['wertyuiop', 'asdfghjk', 'zcbnm'],
  /** 22키를 8/7/7 로 다시 나눈다. 한 줄에 8키뿐이라 키가 제일 크다. 자리 기억은 깨진다 */
  wide: ['wertyuio', 'pasdfgh', 'jkzcbnm'],
}

export const KEYPAD_LABEL: Record<KeypadLayout, string> = {
  qwerty: 'QWERTY',
  compact: '간결',
  wide: '넓게',
}
