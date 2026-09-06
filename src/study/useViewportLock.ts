// iOS 스탠드얼론(홈 화면 웹앱)에서 소프트 키보드가 떠도 상단(진행률·숙어)이 안 밀리게 한다.
// interactive-widget=resizes-content 는 iOS 미지원이라, visualViewport 로 실제 보이는
// 높이를 --vvh 로 내려주고(.study/.diag 가 100dvh 대신 이걸 쓴다), Safari 가 입력을
// 보이려고 밀어 올린 스크롤을 매번 0 으로 되돌린다.
import { useEffect } from 'react'

export function useViewportLock(): void {
  useEffect(() => {
    const vv = window.visualViewport
    const root = document.documentElement
    const prevBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const apply = () => {
      const h = vv ? vv.height : window.innerHeight
      root.style.setProperty('--vvh', `${Math.round(h)}px`)
      // Safari 가 포커스된 입력을 화면에 넣으려고 문서를 밀어 올린다 — 되돌린다
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    apply()

    vv?.addEventListener('resize', apply)
    vv?.addEventListener('scroll', apply)
    window.addEventListener('scroll', apply, { passive: true })
    return () => {
      vv?.removeEventListener('resize', apply)
      vv?.removeEventListener('scroll', apply)
      window.removeEventListener('scroll', apply)
      root.style.removeProperty('--vvh')
      document.body.style.overflow = prevBodyOverflow
    }
  }, [])
}
