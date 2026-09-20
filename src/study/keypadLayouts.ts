// 로마자 자판 배열 (2026-09-20 사용자 요청 "안 쓰는 키를 없애면 더 크게 쓸 수 있겠다").
//
// **실측 근거** — 밴드 0~4 읽기 102,377개를 로마자로 펴서 글자를 세니 `l` `q` `v` `x` 는
// **0회**다 (`tools/measure-romaji-letters.ts`). 대체 표기도 안전하다: し를 si, つ를 tu,
// ち를 ti, ふ를 hu 로 쳐도 전부 남는 글자로 된다. x·l 은 wanakana 의 작은 가나 접두사인데
// っ 는 자음 겹침으로, ゃゅょ 는 kya 로 나오니 쓸 일이 없다.
//
// 그래서 22자로 줄이면 키가 커진다 (32.2px → 36.3px, +13%).
//
// **줄은 안 다시 나눈다** (2026-09-20 사용자 지적 "키 배열은 QWERTY 와 유사했으면 좋겠다").
// 22자를 8/7/7 로 재배치하면 41.5px(+29%)까지 커지지만 QWERTY 와 안 닮는다 — 만들어 재 보고
// 뺐다. 남은 선택은 "넷을 뺄지 말지" 하나다.
//
// 정확히 적자면 **순서는 그대로고 자리는 한 칸씩 당겨진다** (q 가 빠져 w 가 맨 왼쪽으로).
// 자리를 완전히 고정하려면 뺀 키를 빈 칸으로 남겨야 하는데, 그러면 폭이 하나도 안 늘어
// 이 배열을 만든 이유가 없어진다.

export type KeypadLayout = 'qwerty' | 'compact'

/** 자판에 그릴 글자 줄. 마지막 줄 오른쪽에 ⌫ 가 붙는다 */
export const KEYPAD_ROWS: Record<KeypadLayout, readonly string[]> = {
  /** 26키. 물리 키보드와 같은 자리 */
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  /** 22키. 안 쓰는 넷만 빼고 줄 구성은 그대로 — 순서가 같고 자리는 한 칸씩 당겨진다 */
  compact: ['wertyuiop', 'asdfghjk', 'zcbnm'],
}

export const KEYPAD_LABEL: Record<KeypadLayout, string> = {
  qwerty: 'QWERTY 26키',
  compact: '간결 22키',
}
