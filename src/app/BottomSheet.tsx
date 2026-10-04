// 하단에서 올라오는 시트 — 처음 높이에서 시작해 끌면 위로 늘어난다 (2026-10-04 설정이 쓴다)
//
// 부모(`.tabbed`)의 아래쪽에 붙고 탭바는 가리지 않는다. 높이는 CSS 가 정하고(`.sheet.peek`·`.sheet.full`),
// 끄는 동안만 px 로 덮는다. **끌리는 곳은 맨 위 핸들·제목 줄뿐이다** — 본문은 세로 스크롤, 슬라이더는 가로
// 조작이라 본문 전체를 끌게 하면 제스처가 부딪힌다 (context-notes 2026-10-04).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextSnap } from './sheetSnap.ts'

/** 전체 높이일 때 위에 남기는 틈 — 뒤 화면이 있다는 표시 */
const TOP_GAP = 8
/** 처음 높이 = 부모 높이의 이 비율 (CSS 의 `clamp` 와 같아야 한다) */
const PEEK_RATIO = 0.52
const PEEK_MIN = 300
/** 이만큼 움직이면 끌기다. 그 아래면 탭 */
const MOVE_SLOP = 6

interface Drag {
  startY: number
  startH: number
  peek: number
  full: number
  lastY: number
  lastT: number
  velocity: number
  moved: boolean
}

export function BottomSheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [full, setFull] = useState(false)
  /** 끄는 동안의 높이(px). 아니면 null — CSS 높이를 쓴다 */
  const [dragH, setDragH] = useState<number | null>(null)

  // 열리면 시트로 포커스를 옮긴다. Esc 로 닫는다
  useEffect(() => {
    sheetRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const metrics = (): { parentH: number; peek: number; full: number } => {
    const parentH = sheetRef.current?.parentElement?.clientHeight ?? window.innerHeight
    const fullH = parentH - TOP_GAP
    return { parentH, peek: Math.min(fullH, Math.max(PEEK_MIN, parentH * PEEK_RATIO)), full: fullH }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const m = metrics()
    // 캡처는 움직이기 시작할 때 건다 — 처음부터 걸면 클릭이 핸들 버튼이 아니라 이 줄로 가서 탭이 안 먹는다
    drag.current = {
      startY: e.clientY,
      startH: sheetRef.current?.offsetHeight ?? m.peek,
      peek: m.peek,
      full: m.full,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
    }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (!d.moved && Math.abs(e.clientY - d.startY) < MOVE_SLOP) return
    if (!d.moved) e.currentTarget.setPointerCapture(e.pointerId)
    d.moved = true
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.velocity = (d.lastY - e.clientY) / dt
    d.lastY = e.clientY
    d.lastT = e.timeStamp
    setDragH(Math.min(d.full, Math.max(0, d.startH + (d.startY - e.clientY))))
  }

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    if (d.moved) {
      const h = Math.min(d.full, Math.max(0, d.startH + (d.startY - e.clientY)))
      const snap = nextSnap(h, d.peek, d.full, d.velocity)
      setDragH(null)
      if (snap === 'close') onClose()
      else setFull(snap === 'full')
    }
    // 클릭 이벤트가 바로 뒤따른다 — 끈 뒤의 클릭은 토글로 안 센다 (아래 onClick)
    window.setTimeout(() => (drag.current = null), 0)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={`sheet ${full ? 'full' : 'peek'}${dragH !== null ? ' dragging' : ''}`}
        style={dragH !== null ? { height: dragH } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {/* 끌리는 곳은 이 줄(핸들 + 제목)뿐이다. 핸들은 버튼이라 탭·Enter 로도 펼쳐진다 */}
        <div
          className="sheet-top"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <button
            type="button"
            className="sheet-grab"
            aria-expanded={full}
            aria-label={full ? `${title} 줄이기` : `${title} 펼치기`}
            onClick={() => {
              if (!drag.current?.moved) setFull((f) => !f)
            }}
          >
            <span className="sheet-handle" aria-hidden="true" />
          </button>
          <div className="sheet-head">
            <h2>{title}</h2>
          </div>
        </div>
        <div className="sheet-body screen-body">{children}</div>
      </div>
    </>
  )
}
