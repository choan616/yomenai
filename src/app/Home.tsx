// 홈 — 홈 탭의 루트. 진단 전엔 진단이, 진단 후엔 세션이 주 동작 (Phase 9-A).
// 2026-09-17 하단 탭 전환 — 리포트·음독 맵·규칙·안내서·설정·찾기가 전부 탭으로 내려갔다.
// 여기 남는 건 **세션을 시작하는 것들뿐**이다. 홈은 2초 안에 세션을 시작하는 자리다
import { useEffect, useState } from 'react'
import { buildSession, rematchCount } from '../core/session.ts'
import { browseCount } from '../core/report.ts'
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
import type { Flow } from '../App.tsx'
import { openGuide } from './guide.ts'
import { isWelcomeSeen, markWelcomeSeen } from './welcome.ts'

interface Preview {
  ready: number
  due: number
  /** 예전에 틀린 읽기 카드 수 — 재대결 대상 */
  rematch: number
  /** 한 번이라도 틀린 읽기 카드 수 — 다시보기 대상. 재대결보다 넓다 */
  browse: number
}

export function Home({ onFlow }: { onFlow: (flow: Flow) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 로그를 읽기 전엔 플래그만 보고, 읽고 나면 수준까지 보고 다시 정한다
  const [needsDiagnostic, setNeedsDiagnostic] = useState(!isDiagnosticDone())
  /** 첫 안내를 아직 안 봤나. 화면 하나를 더 만들지 않고 홈 위에 얹는다 — 아래 주석 참조 */
  const [showWelcome, setShowWelcome] = useState(!isWelcomeSeen())

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
          browse: browseCount(pool, events),
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
      <p className="tagline">일본어 한자, 당황하지 말자!</p>

      {/* 첫 안내 (테스터 피드백 2026-09-14 — "튜토리얼처럼 안내화면이 뜨면").
          **별도 화면이 아니라 홈 위의 패널이다.** 화면을 가로막으면 첫 동작이 가려지고,
          이 앱은 어디에도 모달을 안 쓴다.

          **두 줄만 적는다.** 홈은 스크롤이 없는 화면이라(`.home` 은 flex 중앙 정렬에
          자체 스크롤이 없다) 길어지면 내용이 넘친다. 테스터가 실제로 막혔던 둘만 남기고
          나머지는 안내서로 보낸다 — 읽기만 다룬다는 건 바로 위 태그라인이 이미 말한다 */}
      {showWelcome && (
        <section className="welcome">
          <p className="welcome-title">처음이시면 이것만</p>
          <ul>
            <li>
              모르면 <b>「모르겠어요」</b>를 누르세요. 정답과 해설로 바로 가요.
            </li>
            <li>
              다루는 난이도는 <b>N2 이상</b>이에요.
            </li>
          </ul>
          <div className="welcome-actions">
            <button type="button" className="link" onClick={openGuide}>
              안내서 보기
            </button>
            <button
              type="button"
              onClick={() => {
                markWelcomeSeen()
                setShowWelcome(false)
              }}
            >
              알겠어요
            </button>
          </div>
        </section>
      )}

      {needsDiagnostic ? (
        <>
          <p className="home-stat">
            <span className="dim">먼저 진단으로 시작 지점을 잡을게요</span>
          </p>
          <button
            type="button"
            className="btn-primary big"
            onClick={() => onFlow({ kind: 'diagnostic' })}
          >
            진입 진단 시작
          </button>
          <button
            type="button"
            className="btn rematch"
            onClick={() => onFlow({ kind: 'study' })}
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
            onClick={() => onFlow({ kind: 'study' })}
            disabled={!sessionReady}
          >
            세션 시작
          </button>

          {/* 의욕 없는 날의 진입로. 20장이냐 안 하냐의 양자택일에서 "안 함"이 이긴다 (Phase 11) */}
          {preview && preview.ready > QUICK_SESSION_LIMIT && (
            <button type="button" className="btn quick" onClick={() => onFlow({ kind: 'quick' })}>
              <b>{QUICK_SESSION_LIMIT}장</b>만
              <span className="dim"> · 오늘은 짧게</span>
            </button>
          )}

          {/* 재대결과 다시보기는 **대상이 같다** — 틀렸던 숙어다. 차이는 채점 유무뿐이라
              한 줄에 세워 "풀래, 볼래" 의 선택으로 읽히게 한다 (2026-09-14).
              틀린 게 없으면 줄째로 사라진다 — 첫 진입에는 안 보이는 게 맞다 */}
          {preview && (preview.rematch > 0 || preview.browse > 0) && (
            <div className="wrong-group">
              <p className="wrong-group-label">틀렸던 것</p>
              <div className="wrong-group-row">
                {preview.rematch > 0 && (
                  <button type="button" className="btn rematch" onClick={() => onFlow({ kind: 'rematch' })}>
                    <span className="wg-head">
                      재도전 <span className="wg-badge">{preview.rematch}</span>
                    </span>
                    <span className="wg-note">채점해요</span>
                  </button>
                )}
                {preview.browse > 0 && (
                  <button type="button" className="btn rematch" onClick={() => onFlow({ kind: 'browse' })}>
                    <span className="wg-head">
                      다시보기 <span className="wg-badge">{preview.browse}</span>
                    </span>
                    <span className="wg-note">채점 없이</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  )
}
