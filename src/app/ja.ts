// 한국어 문장에 섞여 든 일본어 구간을 갈라낸다 (2026-09-17).
//
// 규칙 본문은 "ㄱ 받침은 く·き 로 — 学 학 がく" 처럼 한 문장에 두 언어가 섞인다.
// 일본어 글자에 `lang="ja"` 가 안 붙으면 한중일 통합 코드포인트가 **한국 자형으로 그려져
// 사용자가 틀린 글자 모양을 학습한다** (CLAUDE.md 「일본어 렌더링」). 문장 단위로는 못 붙이니
// 구간 단위로 가른다.
//
// 한글 호환 자모(ㄱ·ㄹ·ㅁ)는 U+3131~ 이라 아래 범위 밖이다 — 받침 이름이 일본어로 안 샌다.

/** 가나 · 한자 · 반복부호(々〆) · 장음부(ー) 가 이어지는 구간 */
const JA_RUN = /[々〆ー぀-ヿ㐀-䶿一-鿿]+/g

export interface JaRun {
  text: string
  ja: boolean
}

/** 원문을 순서대로 자른다. 이어 붙이면 원문 그대로여야 한다 */
export function splitJa(text: string): JaRun[] {
  const runs: JaRun[] = []
  let last = 0
  for (const m of text.matchAll(JA_RUN)) {
    const at = m.index
    if (at > last) runs.push({ text: text.slice(last, at), ja: false })
    runs.push({ text: m[0], ja: true })
    last = at + m[0].length
  }
  if (last < text.length) runs.push({ text: text.slice(last), ja: false })
  return runs
}

/** 일본어가 한 글자라도 있나 — 테스트와 화면 분기가 같이 쓴다 */
export function hasJa(text: string): boolean {
  return new RegExp(JA_RUN.source).test(text)
}
