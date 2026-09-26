// 셸 화면에서 문서가 밀려 올라가는 것을 되돌린다 (2026-09-26 사용자 보고)
//
// 증상 둘이 같은 원인이었다 — 하단 탭바가 손가락을 따라 올라가고, 자판이 내려간 뒤
// 탭바가 화면 한가운데 남고 아래가 비었다.
//
// 모바일에서 스크롤하는 것은 `.screen`(`overflow-y: auto`)이고 **문서는 안 움직이는 것이
// 정상**이다. 탭바가 `position: sticky; bottom: 0` 이라 문서가 밀리면 같이 밀린다.
//
// 미는 주체는 iOS Safari 다. 포커스된 입력을 화면에 넣으려고 문서를 올리는데, 자판이
// 내려가도 그 오프셋을 안 되돌린다 (`study/useViewportLock.ts` 머리말에 같은 현상이
// 적혀 있다 — 학습 화면은 그 처방을 쓰지만 셸 화면은 안 썼다). 단어장이 **자동 포커스
// 입력을 가진 유일한 탭 화면**이라 거기서 먼저 드러났다.
//
// **막는 것은 CSS 가 한다.** `index.css` 가 모바일에서 `html, body` 를 `overflow: hidden`
// 으로 둬 문서 자체를 못 움직이게 한다 — 화면 안 스크롤은 `.screen` 이 따로 가지고 있어
// 안 죽는다. 이 훅은 그래도 밀린 경우를 **자판이 오르내릴 때 한 번씩** 되돌리는 자리다.
//
// 높이는 안 건드린다. `useViewportLock` 은 높이를 `--vvh` 로 덮는데 그건 3분할 고정
// 골격(학습·진단) 전용 처방이다.
import { useEffect } from 'react'

/**
 * PC 는 문서가 스크롤러다 (`index.css` 의 같은 질의로 `html/#root` 를 `height: auto` 로
 * 푼다). 거기서 0 으로 되돌리면 페이지를 못 내린다 — 조건을 CSS 와 같게 맞춘다.
 */
const DESKTOP = '(min-width: 700px) and (hover: hover) and (pointer: fine)'

export function useDocumentScrollGuard(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const desktop = window.matchMedia(DESKTOP)

    const reset = () => {
      if (desktop.matches) return
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }

    /**
     * **스크롤마다 되돌리지 않는다** (2026-09-26 사용자 보고 「떨리는 현상이 있다」).
     * 매 `scroll` 에 0 으로 당기면 손가락과 싸워 화면이 떤다. 문서는 CSS 로 이미 못
     * 움직이게 막았고(`index.css` 의 `html, body { overflow: hidden }`), 이 가드는 그래도
     * 밀린 경우를 **한 번씩** 되돌리는 자리로만 남긴다 — 자판이 오르내릴 때다.
     */
    const vv = window.visualViewport
    vv?.addEventListener('resize', reset)
    // 자판이 내려갈 때는 resize 가 늦거나 안 오는 기기가 있다 — 포커스가 빠질 때도 본다
    window.addEventListener('focusout', reset)
    return () => {
      vv?.removeEventListener('resize', reset)
      window.removeEventListener('focusout', reset)
    }
  }, [])
}
