// 지금 담는 묶음 — 찾기에서 + 를 누르면 어느 묶음에 들어가나 (2026-09-25, 단어장)
//
// **담을 때마다 묻지 않으려고 둔 값이다.** 누를 때마다 묶음을 고르게 하면 한 번 누를 일이
// 두 번이 된다. 단어장 화면에서 미리 정해 두고 찾기의 + 는 그대로 한 번이다.
//
// 기기별이라 동기화하지 않는다 — 테마·글자 크기와 같은 자리다. 어느 묶음에 담겼는지는
// `star` 이벤트가 들고 있으므로 이 값이 기기마다 달라도 자료는 안 갈린다.
import { DEFAULT_LIST } from '../core/types.ts'

const KEY = 'yomenai:wordlistCurrent'

export function loadCurrentList(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_LIST
  } catch {
    return DEFAULT_LIST
  }
}

export function saveCurrentList(name: string): void {
  try {
    if (name === DEFAULT_LIST) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, name)
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
}
