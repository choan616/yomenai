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

/**
 * 단어장에 담은 게 있었나 — **홈이 첫 렌더부터 자리를 잡으려는 힌트**다 (2026-10-01).
 *
 * 홈은 세로 중앙 정렬이라 진입로가 계산 뒤에 생기거나 접히면 제목까지 밀린다
 * (`screen-cache.spec.ts` 가 막는 일). 개수는 로그를 읽어야 알 수 있으니, 직전 계산의
 * 결과를 동기로 읽을 수 있게 남겨 둔다 — 진단 완료 플래그와 같은 관례다. 힌트가 낡으면
 * (다른 기기에서 동기화돼 들어온 경우) 한 번 어긋날 뿐 값 자체는 계산이 다시 정한다
 */
const HINT_KEY = 'yomenai:wordlistHint'

export function hasWordlistHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function setWordlistHint(has: boolean): void {
  try {
    if (has) localStorage.setItem(HINT_KEY, '1')
    else localStorage.removeItem(HINT_KEY)
  } catch {
    /* 프라이빗 모드 — 자리 잡기만 못 한다 */
  }
}
