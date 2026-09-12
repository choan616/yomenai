// 훑어보기 화면 — 자주 틀린 숙어를 채점 없이 한 장씩 넘겨 본다 (사용자 요청 2026-09-12).
// 세션과 같은 카드 셸을 쓰되 입력·채점·이벤트가 없다. FSRS 도 안 건드린다.
//
// 넘김은 **CSS scroll-snap 캐러셀**이다 (사용자 요청). 손가락을 따라 오는 움직임·관성·
// 스냅을 브라우저가 하고, 이 파일은 스크롤 위치에서 지금 장을 읽어 머리말에 반영하는 것과
// 버튼이 트랙을 스크롤하게 하는 것만 한다.
import { useEffect, useRef, useState } from 'react'
import { frequentIdioms, pickBrowse } from '../core/report.ts'
import { replay } from '../core/replay.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadExamples } from '../dict/load.ts'
import { tts } from '../study/tts.ts'
import { useViewportLock } from '../study/useViewportLock.ts'

interface BrowseItem {
  id: string
  headword: string
  reading: string
  meaning: string
  wrong: number
  sentences: string[]
}

export function Browse({ onExit }: { onExit: () => void }) {
  useViewportLock()
  const [items, setItems] = useState<BrowseItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState(0)
  /** 캐러셀 트랙. 버튼은 여기를 스크롤하고, 손가락 넘김은 브라우저가 한다 */
  const track = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 예문은 목록과 같이 받는다 — 카드를 넘길 때마다 기다리면 넘기는 맛이 죽는다
        const [pool, examples, events] = await Promise.all([
          loadBaseIdioms(),
          loadExamples(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
        // 들어올 때 한 번만 뽑는다 — 넘기는 도중에 목록이 바뀌면 안 된다
        const rows = pickBrowse(
          frequentIdioms(state, (id) => {
            const it = byId.get(id)
            return it ? { headword: it.headword, reading: it.reading } : undefined
          }),
        )
        setItems(
          rows.map((r) => ({
            ...r,
            meaning: byId.get(r.id)?.koMeaning?.definition?.trim() ?? '',
            sentences: (examples.get(r.id) ?? []).slice(0, 2),
          })),
        )
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  if (error !== null) {
    return <Centered message="불러오지 못했어요." detail={error} onExit={onExit} />
  }
  if (items === null) {
    return <div className="centered">불러오고 있어요…</div>
  }
  if (items.length === 0) {
    return (
      <Centered
        message="아직 훑어볼 게 없어요."
        detail="틀린 숙어가 쌓이면 여기 모여요."
        onExit={onExit}
      />
    )
  }

  const move = (d: -1 | 1) => {
    const el = track.current
    if (el === null) return
    const next = Math.min(items.length - 1, Math.max(0, at + d))
    el.scrollTo({ left: next * el.clientWidth, behavior: 'smooth' })
  }

  return (
    <div className="study browse-screen">
      <header className="study-bar">
        <button type="button" className="link" onClick={onExit} aria-label="훑어보기 나가기">
          ✕
        </button>
        <progress value={at + 1} max={items.length} />
        <span className="count">
          {at + 1} / {items.length}
        </span>
      </header>

      <main
        className="study-main browse-track"
        ref={track}
        onScroll={(e) => {
          // 한 장 폭으로 스냅되므로 반올림이 곧 지금 장이다. 값이 바뀔 때만 리렌더한다
          const el = e.currentTarget
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth))
          setAt((prev) => (prev === i ? prev : Math.min(items.length - 1, Math.max(0, i))))
        }}
      >
        {items.map((item) => (
        <div className="browse-slide" key={item.id}>
        <div className="card">
          <div className="card-head">
            <span className="tag">훑어보기</span>
            <span className="tag muted">{item.wrong}회 틀림</span>
          </div>
          <div className="card-body">
            <p className="headword" lang="ja">
              {item.headword}
            </p>
            <p className="reading-shown" lang="ja">
              {item.reading}
            </p>
            {item.meaning && <p className="meaning">{item.meaning}</p>}
            {tts.available && (
              <button type="button" className="tts-btn" onClick={() => tts.speak(item.reading)}>
                <span aria-hidden="true">🔊</span> 소리 듣기
              </button>
            )}
            {item.sentences.map((sentence) => (
              <p className="browse-ex" lang="ja" key={sentence}>
                {sentence}
              </p>
            ))}
          </div>
        </div>
        </div>
        ))}
      </main>

      {/* 넘김 버튼은 트랙 밖에 한 벌만 둔다 — 카드를 따라 흘러가면 누르려던 자리가 움직인다 */}
      <div className="card-bottom browse-nav">
        <div className="answer-row choice">
          <button type="button" className="btn" disabled={at === 0} onClick={() => move(-1)}>
            ‹ 이전
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={at === items.length - 1}
            onClick={() => move(1)}
          >
            다음 ›
          </button>
        </div>
      </div>
    </div>
  )
}

function Centered({
  message,
  detail,
  onExit,
}: {
  message: string
  detail: string
  onExit: () => void
}) {
  return (
    <div className="centered">
      <p>{message}</p>
      <p className="dim">{detail}</p>
      <button type="button" className="btn-primary" onClick={onExit}>
        돌아가기
      </button>
    </div>
  )
}
