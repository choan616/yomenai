// 입력 중인 로마자가 말이 되는지 — 자판이 이웃 키 사이에서 헷갈릴 때 고르는 근거 (2026-10-11)
//
// 터치는 키 경계 근처에서 이웃 키로 떨어진다(`kyu` 의 u 가 y 로). 시스템 키보드는 언어 모델로 고르는데, 여기서는
// 가장 값싼 근거를 쓴다 — **지금까지 친 로마자에 이 글자를 붙이면 일본어 음절이 되는가.** `ky` 뒤의 `y` 는
// 아무 음절도 못 만들고(`kyy`), `u` 는 만든다(`kyu` → きゅ). wanakana 가 실제로 바꿔 줄 수 있는지로 판정하니
// 입력창이 하는 변환과 어긋나지 않는다.
import { toKana } from 'wanakana'

const VOWELS = ['a', 'i', 'u', 'e', 'o']

/**
 * `romaji` 가 음절의 앞부분(또는 완성된 것)인가. 모음 하나를 붙여 가나로 다 바뀌면 — 남는 알파벳이 없으면 — 말이 된다.
 * 빈 문자열은 늘 말이 된다(새 음절의 시작)
 */
export function isRomajiPrefix(romaji: string): boolean {
  if (romaji === '') return true
  // wanakana 는 yy·ww 도 촉음(っや)으로 읽지만, 이 둘을 겹쳐 촉음을 치는 일은 없다 — 이웃 키를 잘못 친 것이다
  if (/(?:yy|ww)$/i.test(romaji)) return false
  return VOWELS.some((v) => !/[a-z]/i.test(toKana(romaji + v, { IMEMode: 'toHiragana' })))
}

/** 입력창 끝에 아직 가나로 안 바뀌고 남은 로마자 (`きゅ` → '', `きy` → 'y') */
export function trailingRomaji(value: string): string {
  return /[a-zA-Z]+$/.exec(value)?.[0] ?? ''
}

/** 지금 남은 로마자 `pending` 뒤에 `ch` 를 붙여도 음절이 되는가 */
export function canExtend(pending: string, ch: string): boolean {
  return isRomajiPrefix(pending + ch)
}
