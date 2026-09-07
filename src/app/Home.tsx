// 홈 — 진단 전엔 진단이 주 동작, 진단 후엔 세션이 주 동작 (Phase 9-A). 그 아래 리포트·음독 맵·설정
import { useEffect, useState } from 'react'
import { buildSession, rematchCount } from '../core/session.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms } from '../dict/load.ts'
import { buildLevel } from '../core/level.ts'
import {
  isDiagnosticDone,
  markDiagnosticDone,
  shouldOfferDiagnostic,
} from './diagnostic-state.ts'
import { loadSettings, QUICK_SESSION_LIMIT } from './settings.ts'
import type { Screen } from '../App.tsx'

interface Preview {
  ready: number
  due: number
  /** 예전에 틀린 읽기 카드 수 — 재대결 대상 */
  rematch: number
}

export function Home({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 로그를 읽기 전엔 플래그만 보고, 읽고 나면 수준까지 보고 다시 정한다
  const [needsDiagnostic, setNeedsDiagnostic] = useState(!isDiagnosticDone())

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
          rematch: rematchCount(pool, events),
        })

        // 동기화로 받아온 기록만 있고 이 기기의 플래그는 비어 있을 수 있다 (플래그는 안 옮겨온다)
        const bandOf = new Map(pool.map((p) => [p.idiomId, p.band]))
        const level = buildLevel(events, (id) => bandOf.get(id))
        if (!shouldOfferDiagnostic(isDiagnosticDone(), level)) {
          // 다음 진입부터는 로그를 다 읽기 전에도 바로 정해지도록 플래그를 세워 둔다
          markDiagnosticDone()
          setNeedsDiagnostic(false)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const sessionReady = !!preview && preview.ready > 0

  return (
    <main className="home">
      <h1 lang="ja">読めない</h1>
      <p className="tagline">뜻은 아는데 못 읽는 숙어를 바로잡아요</p>

      {needsDiagnostic ? (
        <>
          <p className="home-stat">
            <span className="dim">먼저 진단으로 시작 지점을 잡을게요</span>
          </p>
          <button
            type="button"
            className="btn-primary big"
            onClick={() => onNavigate('diagnostic')}
          >
            진입 진단 시작
          </button>
          <button
            type="button"
            className="btn rematch"
            onClick={() => onNavigate('study')}
            disabled={!sessionReady}
          >
            세션 시작 <span className="dim"> · 진단 건너뛰기</span>
          </button>
        </>
      ) : (
        <>
          <p className="home-stat">
            {error ? (
              <span className="dim">사전을 불러오지 못했어요</span>
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
            disabled={!sessionReady}
          >
            세션 시작
          </button>

          {/* 의욕 없는 날의 진입로. 20장이냐 안 하냐의 양자택일에서 "안 함"이 이긴다 (Phase 11) */}
          {preview && preview.ready > QUICK_SESSION_LIMIT && (
            <button type="button" className="btn quick" onClick={() => onNavigate('quick')}>
              <b>{QUICK_SESSION_LIMIT}장</b>만
              <span className="dim"> · 오늘은 짧게</span>
            </button>
          )}

          {preview && preview.rematch > 0 && (
            <button type="button" className="btn rematch" onClick={() => onNavigate('rematch')}>
              재대결 <b>{preview.rematch}</b>
              <span className="dim"> · 예전에 틀린 것만</span>
            </button>
          )}
        </>
      )}

      <nav className="home-nav">
        <button type="button" onClick={() => onNavigate('report')}>
          진단 리포트 <span className="chev">›</span>
        </button>
        <button type="button" onClick={() => onNavigate('onyomi')}>
          음독 맵 <span className="chev">›</span>
        </button>
        <button type="button" onClick={() => onNavigate('settings')}>
          설정 <span className="chev">›</span>
        </button>
      </nav>
    </main>
  )
}
