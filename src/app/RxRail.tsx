// 「다음에 볼 것」을 옆으로 미는 카드 줄 — 카드 수만큼 점으로 위치를 보인다 (2026-10-05)
//
// 자동으로 넘기지 않는다. 다음 카드가 가장자리에 비쳐서 밀 수 있다는 걸 알린다(CSS `.rx-rail .rx-list` 의 폭).
// 마우스 기기에서는 밀 방법이 없어서(스크롤바를 숨겼고 휠은 세로뿐) 점 줄 양옆에 이전/다음 화살표를 둔다(2026-10-06 사용자 「PC 에서는
// 어떻게 이동?」 · 「점을 클릭하는 건 불편」). 터치 기기에서는 CSS 가 화살표를 숨긴다. 줄에 포커스가 가면 ←/→ 로도 넘어간다
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { ArrowRightIcon } from './icons.tsx'

export function RxRail({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null)
  const [at, setAt] = useState(0)

  /** 한 칸의 폭 = 카드 폭 + 카드 사이 간격 */
  const step = () => {
    const el = ref.current
    const first = el?.children[0] as HTMLElement | undefined
    if (!el || !first) return 0
    return first.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0)
  }

  const onScroll = () => {
    const el = ref.current
    const s = step()
    if (!el || s === 0) return
    setAt(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / s))))
  }

  /** 한 칸 넘긴다. 모션을 줄인 기기에서는 부드럽게 굴리지 않고 바로 간다 */
  const go = (dir: -1 | 1) => {
    const el = ref.current
    if (!el) return
    const to = Math.min(count - 1, Math.max(0, at + dir))
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollTo({ left: to * step(), behavior: calm ? 'auto' : 'smooth' })
  }

  const onKeyDown = (ev: KeyboardEvent<HTMLOListElement>) => {
    // 카드 안의 버튼·입력에서 올라온 키는 건드리지 않는다
    if (ev.target !== ev.currentTarget) return
    if (ev.key === 'ArrowRight') go(1)
    else if (ev.key === 'ArrowLeft') go(-1)
    else return
    ev.preventDefault()
  }

  return (
    <>
      <ol
        className="rx-list"
        ref={ref}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        tabIndex={0}
        aria-label="다음에 볼 것 — 좌우 화살표 키로 넘겨요"
      >
        {children}
      </ol>
      {count > 1 && (
        <div className="rx-nav">
          <button type="button" className="rx-arrow prev" onClick={() => go(-1)} disabled={at <= 0} aria-label="이전 카드">
            <ArrowRightIcon />
          </button>
          <div className="rx-dots" aria-hidden="true">
            {Array.from({ length: count }, (_, i) => (
              <i key={i} className={i === at ? 'on' : ''} />
            ))}
          </div>
          <button type="button" className="rx-arrow next" onClick={() => go(1)} disabled={at >= count - 1} aria-label="다음 카드">
            <ArrowRightIcon />
          </button>
        </div>
      )}
    </>
  )
}
