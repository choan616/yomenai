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
        setApply(() => () => void updateSW(true))
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
