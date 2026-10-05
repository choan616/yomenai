// 「다음에 볼 것」을 옆으로 미는 카드 줄 — 카드 수만큼 점으로 위치를 보인다 (2026-10-05)
//
// 자동으로 넘기지 않는다. 다음 카드가 가장자리에 비쳐서 밀 수 있다는 걸 알린다(CSS `.rx-rail .rx-list > li` 의 폭).
import { useRef, useState, type ReactNode } from 'react'

export function RxRail({ count, children }: { count: number; children: ReactNode }) {
  const ref = useRef<HTMLOListElement>(null)
  const [at, setAt] = useState(0)

  const onScroll = () => {
    const el = ref.current
    const first = el?.children[0] as HTMLElement | undefined
    if (!el || !first) return
    // 카드 폭 + 카드 사이 간격 = 한 칸
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    setAt(Math.min(count - 1, Math.max(0, Math.round(el.scrollLeft / (first.offsetWidth + gap)))))
  }

  return (
    <>
      <ol className="rx-list" ref={ref} onScroll={onScroll}>
        {children}
      </ol>
      {count > 1 && (
        <div className="rx-dots" aria-hidden="true">
          {Array.from({ length: count }, (_, i) => (
            <i key={i} className={i === at ? 'on' : ''} />
          ))}
        </div>
      )}
    </>
  )
}
