// 홈 — 이번 세션 카드 수와 세션 시작 버튼. 그 외 없음 (PLAN §7)
import { useEffect, useState } from 'react'
import { buildSession } from '../core/session.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms } from '../dict/load.ts'
import { SESSION_LIMIT } from '../study/useStudySession.ts'

interface Preview {
  ready: number
  due: number
}

export function Home({ onStart }: { onStart: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, events] = await Promise.all([
          loadBaseIdioms(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const session = buildSession(pool, events, { now: Date.now(), limit: SESSION_LIMIT })
        setPreview({
          ready: session.cards.length,
          due: session.cards.filter((c) => c.due).length,
        })
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="home">
      <h1 lang="ja">読めない</h1>
      <p className="tagline">뜻은 아는데 못 읽는 숙어를 교정한다</p>

      <p className="home-stat">
        {error ? (
          <span className="dim">사전을 불러오지 못했습니다</span>
        ) : preview ? (
          <>
            이번 세션 <b>{preview.ready}</b>장
            {preview.due > 0 && <span className="dim"> · 복습 기한 {preview.due}</span>}
          </>
        ) : (
          <span className="dim">불러오는 중…</span>
        )}
      </p>

      <button
        type="button"
        className="btn-primary big"
        onClick={onStart}
        disabled={!preview || preview.ready === 0}
      >
        세션 시작
      </button>
    </main>
  )
}
