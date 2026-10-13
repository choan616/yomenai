// 단어장 카드 머리의 묶음 알약 — 눌러서 이 카드를 다른 묶음으로 옮기고, 알약 자리에서 묶음 이름을 바꾼다 (2026-10-13)
//
// 모달이 아니다. 알약 바로 아래에 붙는 목록이고, 바깥을 누르거나 Escape 면 닫힌다.
// 「지금 담는 묶음」(찾기의 + 가 들어갈 곳)은 여기서 안 바꾼다 — 그건 단어장 위의 줄이 한다.
import { useEffect, useRef, useState } from 'react'
import { DEFAULT_LIST } from '../core/types.ts'

type Mode = 'view' | 'menu' | 'rename'

export function TagPicker({
  name,
  lists,
  onMove,
  onRename,
}: {
  /** 이 카드가 든 묶음 */
  name: string
  /** 고를 수 있는 묶음 이름 전부 */
  lists: readonly string[]
  /** 이 카드만 다른 묶음으로 옮긴다 */
  onMove: (list: string) => void
  /** 이 묶음 전체의 이름을 바꾼다 */
  onRename: (next: string) => void
}) {
  const [mode, setMode] = useState<Mode>('view')
  const [draft, setDraft] = useState(name)
  const root = useRef<HTMLSpanElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  /** 저장·취소가 한 번 끝난 뒤 따라오는 blur 가 다시 저장하지 않게 한다 */
  const settled = useRef(false)

  // `기본` 은 늘 있어야 하는 자리라 리스트 보기와 같이 이름을 못 바꾼다
  const canRename = name !== DEFAULT_LIST

  // 열린 동안: 바깥을 누르면 닫고(이름 바꾸는 중이면 거기서 저장), Escape 로도 닫는다
  useEffect(() => {
    if (mode === 'view') return
    const onDown = (e: PointerEvent) => {
      if (root.current?.contains(e.target as Node)) return
      // iOS 는 빈 곳을 눌러도 입력이 blur 되지 않는다 — 직접 내려서 저장 경로를 탄다
      if (mode === 'rename') input.current?.blur()
      else setMode('view')
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || mode !== 'menu') return
      setMode('view')
      pill.current?.focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [mode])

  // 목록이 열리면 지금 묶음(없으면 첫 항목)에 포커스를 둔다
  useEffect(() => {
    if (mode !== 'menu') return
    const items = menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]')
    const on = menu.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    ;(on ?? items?.[0])?.focus()
  }, [mode])

  const finishRename = (save: boolean) => {
    if (settled.current) return
    settled.current = true
    const next = draft.trim()
    if (save && next !== '' && next !== name) onRename(next)
    setMode('view')
  }

  if (mode === 'rename') {
    return (
      <span className="tag-pick" ref={root}>
        <input
          ref={input}
          className="tag tag-rename"
          value={draft}
          autoFocus
          enterKeyHint="done"
          aria-label={`${name} 묶음 이름`}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => finishRename(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              finishRename(true)
              pill.current?.focus()
            } else if (e.key === 'Escape') {
              finishRename(false)
              // 입력이 사라진 뒤 알약이 다시 서야 포커스를 줄 수 있다
              requestAnimationFrame(() => pill.current?.focus())
            }
          }}
        />
      </span>
    )
  }

  const move = (dir: 1 | -1 | 'first' | 'last') => {
    const items = [...(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    const next =
      dir === 'first' ? 0 : dir === 'last' ? items.length - 1 : (at + dir + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <span className="tag-pick" ref={root}>
      <button
        ref={pill}
        type="button"
        className="tag tag-pick-btn"
        aria-haspopup="menu"
        aria-expanded={mode === 'menu'}
        aria-label={`${name} 묶음 옮기기·이름 바꾸기`}
        onClick={() => setMode(mode === 'menu' ? 'view' : 'menu')}
      >
        {name}
      </button>
      {mode === 'menu' && (
        <div
          ref={menu}
          className="tag-menu"
          role="menu"
          aria-label="묶음"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') move(1)
            else if (e.key === 'ArrowUp') move(-1)
            else if (e.key === 'Home') move('first')
            else if (e.key === 'End') move('last')
            else if (e.key === 'Tab') setMode('view')
            else return
            if (e.key !== 'Tab') e.preventDefault()
          }}
        >
          {lists.map((list) => (
            <button
              key={list}
              type="button"
              role="menuitemradio"
              aria-checked={list === name}
              tabIndex={-1}
              onClick={() => {
                setMode('view')
                if (list !== name) onMove(list)
                pill.current?.focus()
              }}
            >
              {list}
            </button>
          ))}
          {canRename && (
            <button
              type="button"
              role="menuitem"
              className="tag-menu-rename"
              tabIndex={-1}
              onClick={() => {
                settled.current = false
                setDraft(name)
                setMode('rename')
              }}
            >
              이름 바꾸기
            </button>
          )}
        </div>
      )}
    </span>
  )
}
