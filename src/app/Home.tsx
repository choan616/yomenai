// 홈 — 오늘 복습 수와 세션 시작. 그 아래 리포트·음독 맵·설정 진입점 (PLAN §7)
import { useEffect, useState } from 'react'
import { buildSession } from '../core/session.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms } from '../dict/load.ts'
import { isDiagnosticDone } from './diagnostic-state.ts'
import { loadSettings } from './settings.ts'
import type { Screen } from '../App.tsx'

interface Preview {
  ready: number
  due: number
}

export function Home({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
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
        const { sessionLimit, ratio } = loadSettings()
        const session = buildSession(pool, events, { now: Date.now(), limit: sessionLimit, ratio })
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
        onClick={() => onNavigate('study')}
        disabled={!preview || preview.ready === 0}
      >
        세션 시작
      </button>

      <nav className="home-nav">
        {!isDiagnosticDone() && (
          <button type="button" className="accent" onClick={() => onNavigate('diagnostic')}>
            진입 진단 시작 <span className="chev">›</span>
          </button>
        )}
        <button type="button" onClick={() => onNavigate('report')}>
          진단 리포트 <span className="chev">›</span>
        </button>
        <button type="button" onClick={() => onNavigate('onyomi')}>
          음독 맵 <span className="chev">›</span>
        </button>
      </nav>
    </main>
  )
}
