// 단어장을 리스트로 볼지 카드로 볼지 — 기기별로 기억한다 (2026-10-01)
//
// 이벤트가 아니라 **보기 취향**이다. 기기마다 달라도 자료는 안 갈리므로 `currentList.ts`
// 와 같이 localStorage 에 둔다. `settings.ts` 에 넣지 않은 이유는 거기 저장이 데이터 버전을
// 올려 홈·리포트 캐시를 버리기 때문이다 (보기 전환이 캐시를 날릴 이유가 없다)
export type WordlistView = 'list' | 'card'

const KEY = 'yomenai:wordlistView'

export function loadWordlistView(): WordlistView {
  try {
    return localStorage.getItem(KEY) === 'card' ? 'card' : 'list'
  } catch {
    return 'list'
  }
}

export function saveWordlistView(view: WordlistView): void {
  try {
    if (view === 'list') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, view)
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
}
