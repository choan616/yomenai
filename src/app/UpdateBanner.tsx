// 새 버전이 받아져 대기 중일 때 아래에 띄우는 띠 (2026-09-13).
//
// **멋대로 새로고침하지 않는다.** 카드 한 장 푸는 중에 페이지가 갈리면 그 답이 사라진다.
// 그래서 `registerType: 'prompt'` 로 두고, 새 서비스워커는 사용자가 누를 때까지 기다린다.
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** 앱을 켜 둔 채 며칠 쓰는 경우를 위해 주기적으로도 확인한다. 브라우저는 재방문 때만 본다 */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function UpdateBanner() {
  /** 누르면 새 서비스워커를 활성화하고 새로고침한다. null 이면 대기 중인 버전이 없다 */
  const [apply, setApply] = useState<(() => void) | null>(null)

  useEffect(() => {
    let alive = true
    let timer: ReturnType<typeof setInterval> | undefined

    const updateSW = registerSW({
      onNeedRefresh() {
        if (!alive) return
        // setState 에 함수를 넣으면 갱신 함수로 오해받는다. 한 번 더 감싼다
        setApply(() => () => {
          /**
           * **새로고침을 직접 건다.** vite-plugin-pwa 는 workbox 의 `controlling` 에서
           * `event.isUpdate` 일 때만 새로고침하는데, workbox 는 `isUpdate` 를
           * **등록 시점에 컨트롤러가 있었는가**로 정한다. 그래서 **앱을 처음 깐 탭을
           * 켜 둔 채** 업데이트를 받으면 새 서비스워커는 활성화되는데 화면은 옛 버전
           * 그대로다 — 눌러도 아무 일도 안 일어난 것처럼 보인다.
           *
           * 실측 (2026-09-22, `npm run check:update`):
           *   첫 설치한 탭 그대로 → 배너 O · 적용 후 새로고침 **X**
           *   한 번 새로고침한 뒤 → 배너 O · 적용 후 새로고침 O
           *
           * 컨트롤러가 이미 있던 평소 경로에서는 workbox 도 새로고침하지만, 둘 다 같은
           * `controllerchange` 한 번에서 도는 것이라 이동은 한 번이다.
           */
          navigator.serviceWorker?.addEventListener(
            'controllerchange',
            () => window.location.reload(),
            { once: true },
          )
          void updateSW(true)
        })
      },
      onRegisteredSW(_url, registration) {
        if (!registration) return
        timer = setInterval(() => void registration.update(), CHECK_INTERVAL_MS)
      },
    })

    return () => {
      alive = false
      if (timer !== undefined) clearInterval(timer)
    }
  }, [])

  if (apply === null) return null

  return (
    <div className="update-banner" role="status">
      <span>새 버전이 준비됐어요.</span>
      <button type="button" onClick={apply}>
        지금 적용
      </button>
    </div>
  )
}
