// 홈 — 홈 탭의 루트. 진단 전엔 진단이, 진단 후엔 세션이 주 동작 (Phase 9-A).
// 2026-09-17 하단 탭 전환 — 리포트·음독 맵·규칙·안내서·설정·찾기가 전부 탭으로 내려갔다.
// 여기 남는 건 **세션을 시작하는 것들뿐**이다. 홈은 2초 안에 세션을 시작하는 자리다
import { useEffect, useState } from 'react'
import { dataVersion } from '../core/dataVersion.ts'
import { buildSession, rematchCount } from '../core/session.ts'
import { browseCount } from '../core/report.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, studyPool } from '../dict/load.ts'
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
  /**
   * 이번 세션에서 **처음 보는** 카드 수 (`due: false`). 기한이 지난 카드가 모자랄 때
   * 그 나머지를 신규가 채우므로(`selectSession`), 설정이 아니라 매일 달라지는 값이다.
   * 옛 「복습 기한 N」은 `ready` 의 부분집합이라 대개 같은 숫자를 두 번 말했다 (2026-09-17)
   */
  fresh: number
  /** 예전에 틀린 읽기 카드 수 — 재대결 대상 */
  rematch: number
  /** 한 번이라도 틀린 읽기 카드 수 — 다시보기 대상. 재대결보다 넓다 */
  browse: number
}

/**
 * 마지막으로 계산한 미리보기 (2026-09-21). 탭을 옮기면 이 화면이 언마운트되는데, 다시
 * 들어올 때마다 `listEvents` → `replay` → `buildSession`(후보 16,959개)을 처음부터
 * 돌면 그 사이가 2단계 렌더가 되어 화면이 튄다 (사용자 실기기 지적).
 *
 * `dataVersion` 이 같으면 기록도 설정도 안 바뀐 것이라 **첫 렌더부터 완성된 화면**을 그린다.
 * 모듈 변수라 앱을 닫으면 사라진다 — 오래된 값을 디스크에 들고 있지 않는다.
 */
let cache: { version: number; preview: Preview } | null = null

export function Home({ onFlow }: { onFlow: (flow: Flow) => void }) {
  // 초기화 함수에서 캐시를 꺼낸다 — effect 로 넣으면 로딩 화면이 한 번 그려진 뒤에 바뀐다
  const [preview, setPreview] = useState<Preview | null>(
    () => (cache?.version === dataVersion() ? cache.preview : null),
  )
  const [error, setError] = useState<string | null>(null)
  // 로그를 읽기 전엔 플래그만 보고, 읽고 나면 수준까지 보고 다시 정한다
  const [needsDiagnostic, setNeedsDiagnostic] = useState(!isDiagnosticDone())
  /** 첫 안내를 아직 안 봤나. 화면 하나를 더 만들지 않고 홈 위에 얹는다 — 아래 주석 참조 */
  const [showWelcome, setShowWelcome] = useState(!isWelcomeSeen())

  useEffect(() => {
    // 캐시가 유효하면 다시 계산하지 않는다. 진단 판정은 아래 플래그로 이미 끝나 있다
    if (cache?.version === dataVersion()) return
    let alive = true
    ;(async () => {
      try {
        const [all, events] = await Promise.all([
          loadBaseIdioms(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        // 설정이 정한 범위 그대로. 세션이 보는 것과 같은 풀이라야 미리보기가 안 어긋난다
        const { sessionLimit, ratio, kunPercent } = loadSettings()
        const pool = studyPool(all, kunPercent > 0)
        const session = buildSession(pool, events, {
          now: Date.now(),
          limit: sessionLimit,
          ratio,
          kunShare: kunPercent / 100,
        })
        const next: Preview = {
          ready: session.cards.length,
          fresh: session.cards.filter((c) => !c.due).length,
          rematch: rematchCount(pool, events),
          browse: browseCount(pool, events),
        }
        cache = { version: dataVersion(), preview: next }
        setPreview(next)

        // 동기화로 받아온 기록만 있고 이 기기의 플래그는 비어 있을 수 있다 (플래그는 안 옮겨온다)
        // 출제 풀로만 만든다 — 범위 밖 기록은 undefined 가 되어 수준 판정에서 빠진다 (Report 와 같다)
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
              모르면 카드 오른쪽 위 <b>SKIP</b> 을 누르세요. 정답과 해설로 바로 가요.
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
                {/* 오늘 얼마나 새것을 만나는지. 전부 복습인 날은 아예 안 뜬다 —
                    앞 숫자와 같은 말을 두 번 하지 않는다 (사용자 지적 2026-09-17) */}
                {preview.fresh > 0 && <span className="dim"> · 새 표현 {preview.fresh}</span>}
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
          {/* 아직 계산 전이면 **자리만 잡아 둔다** (2026-09-21 사용자 지적). `.home` 은 세로
              중앙 정렬이라, 버튼이 뒤늦게 생기면 그 높이의 절반만큼 제목까지 위로 밀린다.
              `.answer-row` 가 빈 슬롯으로 주 동작의 자리를 지키는 것과 같은 처방이다 */}
          {preview === null ? (
            <button type="button" className="btn quick slot" aria-hidden="true" tabIndex={-1}>
              <b>{QUICK_SESSION_LIMIT}장</b>만
              <span className="dim"> · 오늘은 짧게</span>
            </button>
          ) : (
            preview.ready > QUICK_SESSION_LIMIT && (
              <button type="button" className="btn quick" onClick={() => onFlow({ kind: 'quick' })}>
                <b>{QUICK_SESSION_LIMIT}장</b>만
                <span className="dim"> · 오늘은 짧게</span>
              </button>
            )
          )}

          {/* 재대결과 다시보기는 **대상이 같다** — 틀렸던 숙어다. 차이는 채점 유무뿐이라
              한 줄에 세워 "풀래, 볼래" 의 선택으로 읽히게 한다 (2026-09-14).
              틀린 게 없으면 줄째로 사라진다 — 첫 진입에는 안 보이는 게 맞다 */}
          {/* 같은 이유로 「틀렸던 것」 자리도 잡는다. 높이를 숫자로 적지 않고 **진짜 마크업을
              숨겨서** 잡는다 — 버튼 높이가 바뀌어도 자리가 따라온다.
              기록이 하나도 없는 사람은 계산 뒤에 이 자리가 접히며 한 번 움직인다.
              그 사람은 대개 위쪽 진단 분기에 있어 여기까지 오지 않는다 */}
          {preview === null && (
            <div className="wrong-group slot" aria-hidden="true">
              <p className="wrong-group-label">틀렸던 것</p>
              <div className="wrong-group-row">
                <button type="button" className="btn rematch" tabIndex={-1}>
                  <span className="wg-head">
                    재도전 <span className="wg-badge">0</span>
                  </span>
                  <span className="wg-note">채점해요</span>
                </button>
              </div>
            </div>
          )}
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
