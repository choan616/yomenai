// 단어장 카드 보기 — 담은 표현을 요미가나를 가린 카드로 한 장씩 넘겨 본다 (2026-10-01)
//
// 카드 셸·가림막은 다시보기(`Browse`)의 `BrowseSlide` 를 그대로 쓴다. 가림막은 iOS 에서 한 번
// 깨진 적이 있어(context-notes 2026-09-21) 새로 짜지 않는다. **가림은 항상 켠다** — 설정
// `browseMask` 를 따르는 다시보기와 달리 여기서는 카드의 정의다.
//
// 넘김 상태(지금 장·벗김·예문 자리)는 다시보기와 같은 규칙이다 — 카드를 떠나면 도로 가린다.
// 관리(메모 고치기·빼기·묶음 옮기기)는 리스트에만 둔다. 카드를 넘기다 잘못 누르면 안 되므로.
import { useRef, useState } from 'react'
import { BrowseSlide, type BrowseItem } from './Browse.tsx'

export interface WordCard {
  item: BrowseItem
  /** 머리 태그 — 묶음 이름 */
  tag: string
  /** 태그 옆 상태 — 학습 중 · ✗ N회 */
  note: string
  memo?: string
}

export function WordCards({
  cards,
  star,
  onClose,
}: {
  cards: readonly WordCard[]
  /**
   * 담기를 쓸 때만 준다 (2026-10-06, 끝말잇기 말 카드). **단어장 카드 보기는 안 준다** —
   * 이미 담은 것들이고, 카드에 관리 기능을 두지 않는다는 결정이 그대로다 (2026-10-01)
   */
  star?: { has: (id: string) => boolean; toggle: (id: string) => void }
  /** 전체화면으로 쓸 때의 나가기. 탭 안에 끼워 쓰는 단어장은 제 머리말이 있어 안 준다 */
  onClose?: () => void
}) {
  const track = useRef<HTMLElement | null>(null)
  const [at, setAt] = useState(0)
  const [exIndex, setExIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  // 장이 바뀌면 렌더 중에 되돌린다 (Browse 와 같은 이유 — effect 로 하면 한 번 더 그린다)
  const [seen, setSeen] = useState(0)
  if (seen !== at) {
    setSeen(at)
    setExIndex(0)
    setRevealed(false)
  }

  const move = (d: -1 | 1) => {
    const el = track.current
    if (el === null) return
    const next = Math.min(cards.length - 1, Math.max(0, at + d))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="wl-deck">
      <header className="study-bar">
        {onClose && (
          <button type="button" className="link" onClick={onClose} aria-label="카드 닫기">
            ✕
          </button>
        )}
        <progress value={at + 1} max={cards.length} />
        <span className="count">
          {at + 1} / {cards.length}
        </span>
      </header>

      <main
        className="study-main browse-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
          setAt((prev) => (prev === i ? prev : Math.min(cards.length - 1, Math.max(0, i))))
        }}
      >
        {cards.map((c, index) => (
          <BrowseSlide
            key={c.item.id}
            item={c.item}
            tag={c.tag}
            {...(star ? { star: { on: star.has(c.item.id), onToggle: () => star.toggle(c.item.id) } } : {})}
            note={c.note}
            {...(c.memo ? { memo: c.memo } : {})}
            mask
            masked={!(index === at && revealed)}
            onToggleMask={() => setRevealed((v) => !v)}
            exAt={index === at ? exIndex : 0}
            onNextEx={() => setExIndex((n) => (n + 1) % c.item.sentences.length)}
            ruleOpen={false}
            onToggleRule={() => {}}
          />
        ))}
      </main>

      <div className="card-bottom browse-nav">
        <div className="answer-row">
          <button type="button" className="btn" disabled={at === 0} onClick={() => move(-1)}>
            ‹ 이전
          </button>
          {/* 마지막 장에서는 「닫기」다 (사용자 지시 2026-10-06) — 끌 데가 있는 전체화면 덱에만.
              단어장 카드 보기는 제 머리말로 돌아가므로 전처럼 비활성 「다음」이 선다 */}
          {onClose && at === cards.length - 1 ? (
            <button type="button" className="btn-primary" onClick={onClose}>
              닫기
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              disabled={at === cards.length - 1}
              onClick={() => move(1)}
            >
              다음 ›
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
