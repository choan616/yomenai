// 하단에서 올라오는 시트 — 처음 높이에서 시작해 끌면 위로 늘어난다 (2026-10-04 설정이 쓴다)
//
// 부모(`.tabbed`)의 아래쪽에 붙고 탭바는 가리지 않는다. 높이는 CSS 가 정하고(`.sheet.peek`·`.sheet.full`),
// 끄는 동안만 px 로 덮는다. **끌리는 곳은 맨 위 핸들·제목 줄뿐이다** — 본문은 세로 스크롤, 슬라이더는 가로
// 조작이라 본문 전체를 끌게 하면 제스처가 부딪힌다 (context-notes 2026-10-04).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { nextSnap } from './sheetSnap.ts'

/**
 * 지금 열려 있는 시트 — **한 번에 하나다** (2026-10-06 사용자 신고).
 *
 * 설정은 탭이면서 시트라, 리포트의 시트가 열린 채 설정 탭을 누르면 둘이 같은 자리에 겹쳐 섰다.
 * 탭을 옮겨도 밑에 깔린 탭은 그대로 살아 있어(App 의 `underTab`) 제 시트를 들고 있기 때문이다.
 * 나중에 열린 쪽이 앞서 열린 쪽을 닫는다 — 닫는 길은 그 시트가 준 `onClose` 라 그쪽 상태도
 * 같이 정리된다. 부모끼리 서로를 알 필요가 없고, 시트가 느는 만큼 저절로 지켜진다
 */
let openSheet: { close: () => void } | null = null

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

  /** 늘 최신 onClose 를 가리킨다 — 아래 effect 는 한 번만 돌기 때문이다 */
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  // 열리면서 앞서 열려 있던 시트를 닫는다 (위 openSheet 주석)
  useEffect(() => {
    const mine = { close: () => closeRef.current() }
    openSheet?.close()
    openSheet = mine
    return () => {
      if (openSheet === mine) openSheet = null
    }
  }, [])

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

  // 끄는 동안의 움직임은 **window 에서** 받는다 (2026-10-05). 마우스는 포인터가 시트 밖(뒤쪽 배경)으로 나가면
  // 이벤트가 그쪽으로 가서 이 줄의 핸들러가 못 받았다. 포인터 캡처는 쓰지 않는다 — 걸면 뒤따르는 클릭이
  // 핸들 버튼이 아니라 이 줄로 가서 탭이 안 먹는다 (앞 절의 첫 버그)
  const stopListening = useRef<() => void>(() => {})
  useEffect(() => () => stopListening.current(), [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopListening.current()
    const m = metrics()
    const d: Drag = {
      startY: e.clientY,
      startH: sheetRef.current?.offsetHeight ?? m.peek,
      peek: m.peek,
      full: m.full,
      lastY: e.clientY,
      lastT: e.timeStamp,
      velocity: 0,
      moved: false,
    }
    drag.current = d

    const move = (ev: PointerEvent) => {
      if (!d.moved && Math.abs(ev.clientY - d.startY) < MOVE_SLOP) return
      d.moved = true
      const dt = ev.timeStamp - d.lastT
      if (dt > 0) d.velocity = (d.lastY - ev.clientY) / dt
      d.lastY = ev.clientY
      d.lastT = ev.timeStamp
      setDragH(Math.min(d.full, Math.max(0, d.startH + (d.startY - ev.clientY))))
    }
    const up = (ev: PointerEvent) => {
      stopListening.current()
      if (d.moved) {
        const h = Math.min(d.full, Math.max(0, d.startH + (d.startY - ev.clientY)))
        const snap = nextSnap(h, d.peek, d.full, d.velocity)
        setDragH(null)
        if (snap === 'close') onClose()
        else setFull(snap === 'full')
      }
      // 클릭 이벤트가 바로 뒤따른다 — 끈 뒤의 클릭은 토글로 안 센다 (아래 onClick)
      window.setTimeout(() => {
        if (drag.current === d) drag.current = null
      }, 0)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    stopListening.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      stopListening.current = () => {}
    }
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
