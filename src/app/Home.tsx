// 홈 — 홈 탭의 루트. 진단 전엔 진단이, 진단 후엔 세션이 주 동작 (Phase 9-A).
// 2026-09-17 하단 탭 전환 — 리포트·음독 맵·규칙·안내서·설정·찾기가 전부 탭으로 내려갔다.
// 여기 남는 건 **세션을 시작하는 것들뿐**이다. 홈은 2초 안에 세션을 시작하는 자리다
import { useEffect, useState } from 'react'
import { dataVersion } from '../core/dataVersion.ts'
import { buildSession, rematchCount } from '../core/session.ts'
import { browseCount } from '../core/report.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { replay } from '../core/replay.ts'
import { loadKanji } from '../dict/load.ts'
import { loadStudyPool } from '../dict/pool.ts'
import { buildLevel } from '../core/level.ts'
import { buildAttendance, dateKey, weekStrip, type WeekCell } from '../core/attendance.ts'
import { buildStreak, type StreakRecord } from '../core/streak.ts'
import {
  isDiagnosticDone,
  markDiagnosticDone,
  shouldOfferDiagnostic,
} from './diagnostic-state.ts'
import { loadSettings, QUICK_SESSION_LIMIT } from './settings.ts'
import type { Flow } from '../App.tsx'
import { openGuide } from './guide.ts'
import { isWelcomeSeen, markWelcomeSeen } from './welcome.ts'
import { WeekStrip } from './WeekStrip.tsx'
import { homeLine } from './weekLine.tsx'
import { hasWordlistHint, setWordlistHint } from './wordlistView.ts'
import { markNudgeShown, NUDGE_DISMISS_MS, shouldNudge } from './nudgeToast.ts'

interface Preview {
  /**
   * 세션에 낼 카드 수. **홈에 숫자로는 안 적는다** (2026-10-02) — 주 동작을 누를 수 있는지만
   * 가린다. 옛 「이번 세션 20장 · 새 표현 6」 줄과 그 뒤 숫자(`fresh`)는 그때 같이 걷어냈다
   */
  ready: number
  /** 예전에 틀린 읽기 카드 수 — 재대결 대상 */
  rematch: number
  /** 한 번이라도 틀린 읽기 카드 수 — 다시보기 대상. 재대결보다 넓다 */
  browse: number
  /** 단어장에 담은 표현 수. 0 이면 홈에 진입로를 안 낸다 — 첫 담기는 찾기에서 한다 (2026-10-01) */
  wordlist: number
  /** 이번 주 띠 (2026-09-30) */
  week: WeekCell[]
  streak: StreakRecord
  /** 이 미리보기를 계산한 날. 앱을 켜 둔 채 자정을 넘기면 띠가 어제에 머물지 않게 캐시를 버린다 */
  day: string
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

/** 계산 전 자리 잡기용 띠. 숨겨 두는 칸이라 날짜는 아무 주나 된다 — 높이만 같으면 된다 */
const SLOT_WEEK = weekStrip('2026-09-27', new Map())

/** 캐시가 지금도 유효한가 — 기록·설정이 그대로이고 날짜도 그대로여야 한다 */
function cacheValid(): boolean {
  return cache?.version === dataVersion() && cache.preview.day === dateKey(Date.now())
}

export function Home({
  onFlow,
  onWordlist,
}: {
  onFlow: (flow: Flow) => void
  onWordlist: () => void
}) {
  // 초기화 함수에서 캐시를 꺼낸다 — effect 로 넣으면 로딩 화면이 한 번 그려진 뒤에 바뀐다
  const [preview, setPreview] = useState<Preview | null>(
    () => (cacheValid() ? cache!.preview : null),
  )
  const [error, setError] = useState<string | null>(null)
  // 로그를 읽기 전엔 플래그만 보고, 읽고 나면 수준까지 보고 다시 정한다
  const [needsDiagnostic, setNeedsDiagnostic] = useState(!isDiagnosticDone())
  /** 첫 안내를 아직 안 봤나. 화면 하나를 더 만들지 않고 홈 위에 얹는다 — 아래 주석 참조 */
  const [showWelcome, setShowWelcome] = useState(!isWelcomeSeen())
  /** 직전 계산에서 단어장에 담은 게 있었나. 계산 전에 진입로 자리를 잡을지만 정한다 */
  const [wordlistHint] = useState(hasWordlistHint)
  /**
   * 「오늘은 짧게」 토스트가 지금 떠 있나 (2026-10-02 사용자 지시).
   *
   * 판정은 **홈에 들어오는 길 두 곳**에서 한다. 캐시로 들어왔으면 여기서 바로(계산이 없다),
   * 처음 계산하는 길이면 계산이 끝나는 자리에서. 그래서 탭을 옮겼다 돌아와도 같은 규칙이 돈다.
   * 진단 전과 첫 안내 중에는 안 띄운다 — 그 둘은 「오늘 뭘 할까」보다 먼저 할 일이 있는 상태다.
   * 띄우는 순간 그날 기록을 남긴다. 닫든 8초로 사라지든 그날은 끝이다 (`nudgeToast.ts`)
   */
  const [nudge, setNudge] = useState(() => {
    const p = cacheValid() ? cache!.preview : null
    if (!p || !isDiagnosticDone() || !isWelcomeSeen()) return false
    if (!shouldNudge(p.streak.todayDone, p.day, Date.now())) return false
    markNudgeShown(p.day)
    return true
  })

  useEffect(() => {
    // 캐시가 유효하면 다시 계산하지 않는다. 진단 판정은 아래 플래그로 이미 끝나 있다
    if (cacheValid()) return
    let alive = true
    ;(async () => {
      try {
        const [kanji, events] = await Promise.all([
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        // 설정이 정한 범위 그대로. 세션이 보는 것과 같은 풀이라야 미리보기가 안 어긋난다 —
        // **같은 함수로 만든다** (2026-09-26). 전에는 `base.json` 만 봐서 담아 둔 밴드 4 가
        // 세션에는 나오는데 미리보기 장수에는 안 잡혔다
        const { sessionLimit, ratio, kunPercent } = loadSettings()
        const state = replay(events)
        const { pool } = await loadStudyPool({
          starred: state.starred,
          includeKun: kunPercent > 0,
          kanji,
        })
        if (!alive) return
        const session = buildSession(pool, events, {
          now: Date.now(),
          limit: sessionLimit,
          ratio,
          kunShare: kunPercent / 100,
        })
        const day = dateKey(Date.now())
        // 리포트 달력과 같은 문턱. 연속은 `touched`(3장) 문턱만 보므로 sessionLimit 과 무관하다
        const attendance = buildAttendance(events, { quick: QUICK_SESSION_LIMIT, full: sessionLimit })
        const next: Preview = {
          ready: session.cards.length,
          rematch: rematchCount(pool, events),
          browse: browseCount(pool, events),
          wordlist: state.wordlist.size,
          week: weekStrip(day, attendance),
          streak: buildStreak(attendance, day),
          day,
        }
        cache = { version: dataVersion(), preview: next }
        setWordlistHint(next.wordlist > 0)
        setPreview(next)

        // 동기화로 받아온 기록만 있고 이 기기의 플래그는 비어 있을 수 있다 (플래그는 안 옮겨온다)
        // 출제 풀로만 만든다 — 범위 밖 기록은 undefined 가 되어 수준 판정에서 빠진다 (Report 와 같다)
        const bandOf = new Map(pool.map((p) => [p.idiomId, p.band]))
        const level = buildLevel(events, (id) => bandOf.get(id))
        const offerDiagnostic = shouldOfferDiagnostic(isDiagnosticDone(), level)
        if (!offerDiagnostic) {
          // 다음 진입부터는 로그를 다 읽기 전에도 바로 정해지도록 플래그를 세워 둔다
          markDiagnosticDone()
          setNeedsDiagnostic(false)
        }
        // 「오늘은 짧게」 토스트 — 계산이 끝난 **이 자리**에서 한 번만 본다 (아래 상태 주석)
        if (offerDiagnostic || !isWelcomeSeen()) return
        if (shouldNudge(next.streak.todayDone, day, Date.now())) {
          markNudgeShown(day)
          setNudge(true)
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // 스스로 사라진다. 세션으로 들어가면 홈이 언마운트되며 같이 사라진다
  useEffect(() => {
    if (!nudge) return
    const t = setTimeout(() => setNudge(false), NUDGE_DISMISS_MS)
    return () => clearTimeout(t)
  }, [nudge])

  const sessionReady = !!preview && preview.ready > 0
  /** 단어장 칸을 낼지. 계산 전엔 직전에 담은 게 있던 기기에서만 자리를 잡는다 (아래 주석) */
  const wordlistShown = preview === null ? wordlistHint : preview.wordlist > 0

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
          {/* 숫자 줄을 걷어냈다 (2026-10-02 사용자 지시). 「이번 세션 20장」은 설정에서 자기가 정한
              길이를 되읽는 말이고, 「새 표현 N」은 그 줄에 붙어 살던 값이다. 오늘의 신호는 바로
              아래 띠 한 줄이 말한다.

              **「불러오는 중…」도 같이 걷어냈다.** 계산이 끝날 때 줄이 사라지면 `.home` 이 세로
              중앙 정렬이라 제목까지 그만큼 올라간다 — 자리를 숨겨 잡는 `.slot` 관례와 같은 이유다.
              그 사이는 주 동작이 눌리지 않는 것으로 알린다 */}
          {error && (
            <p className="home-stat">
              <span className="dim">사전을 불러오지 못했어요</span>
            </p>
          )}

          {/* 이번 주 띠 (2026-09-30). "오늘 할까"를 정하는 자리라 주 동작 바로 위에 둔다 —
              리포트 달력은 돌아보는 기록이고 이건 결정 신호다. 문구는 「3장이면…」이라고
              말하지만 그 버튼은 2026-10-02 에 리포트 달력으로 옮겼다 — 여기 남은 건 **문턱이
              3장이라는 사실**이고, 세션 시작으로 3장을 넘겨도 칸은 채워진다.
              계산 전엔 같은 마크업을 숨겨 자리만 잡는다 (단어장 슬롯과 같은 이유) */}
          {preview === null ? (
            <WeekStrip cells={SLOT_WEEK} line="·" slot />
          ) : (
            <WeekStrip cells={preview.week} line={homeLine(preview.streak, preview.day)} />
          )}

          <button
            type="button"
            className="btn-primary big"
            onClick={() => onFlow({ kind: 'study' })}
            disabled={!sessionReady}
          >
            세션 시작
          </button>

          {/* 「3장만」은 홈에서 걷어냈다 (2026-10-02 사용자 지시) — 짧은 세션으로 가는 길은 리포트
              달력에서 **오늘 칸을 누를 때** 낸다(`Report.tsx` 의 `.cal-nudge`). 의욕 없는 날의
              진입로라는 목적은 그대로지만(Phase 11), 매일 보이는 버튼일 이유는 없다.

              남은 단어장 칸은 계산 전이면 **자리만 잡아 둔다** (2026-09-21 사용자 지적). `.home` 은
              세로 중앙 정렬이라, 버튼이 뒤늦게 생기면 그 높이의 절반만큼 제목까지 위로 밀린다.
              `.answer-row` 가 빈 슬롯으로 주 동작의 자리를 지키는 것과 같은 처방이다.
              담은 게 없으면 단어장 칸이 없다 — 찾기에서 담으며 들어가는 길이 이미 있다.
              **직전 계산에서 담은 게 있던 기기에서만** 계산 전에 자리를 잡는다 — 개수는 로그를 읽어야
              알 수 있어 힌트로 정한다. 늘 잡으면 담은 게 없는 사람은 계산 뒤에 칸이 접히고, 안 잡으면
              담은 사람이 계산 뒤에 밀린다 (`screen-cache.spec.ts` 가 잡는다) */}
          {wordlistShown && (
            <div className="quick-row">
              {preview === null ? (
                <button type="button" className="btn quick wl slot" aria-hidden="true" tabIndex={-1}>
                  단어장<span className="dim"> · 0</span>
                </button>
              ) : (
                <button type="button" className="btn quick wl" onClick={onWordlist}>
                  단어장<span className="dim"> · {preview.wordlist.toLocaleString('ko')}</span>
                </button>
              )}
            </div>
          )}

          {/* 재대결과 다시보기는 **대상이 같다** — 틀렸던 숙어다. 한 줄에 세워 "풀래, 볼래" 의
              선택으로 읽히게 한다 (2026-09-14). 틀린 게 없으면 줄째로 사라진다 — 첫 진입에는
              안 보이는 게 맞다.
              **설명 줄(「채점해요」·「채점 없이」)은 걷어냈다** (2026-10-02 사용자 지시) —
              이름만으로 갈리는 자리에 한 줄을 더 읽게 할 이유가 없다 */}
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
                  </button>
                )}
                {preview.browse > 0 && (
                  <button type="button" className="btn rematch" onClick={() => onFlow({ kind: 'browse' })}>
                    <span className="wg-head">
                      다시보기 <span className="wg-badge">{preview.browse}</span>
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 「오늘은 짧게」 토스트 (2026-10-02 사용자 지시) — 22시가 지났는데 오늘 칸이 비었을 때
              한 번. 탭바 바로 위에 뜨고 8초 뒤 스스로 사라진다. 모달이 아니라 아무것도 막지 않는다.

              **문구는 띠와 다른 말을 한다.** 띠가 바로 위에서 이미 「3장이면 …」이라고 약속하므로
              같은 문장을 두 번 쓰지 않는다 — 여기 할 일은 권하는 것이고, 약속은 띠가 한다.
              재촉으로 읽히지 않게 긍정형 한 줄과 닫기만 둔다 (`nudgeToast.ts` 머리 주석) */}
          {nudge && (
            <div className="nudge-toast" role="status">
              <p>오늘은 짧게 어때요?</p>
              <button type="button" className="btn quick" onClick={() => onFlow({ kind: 'quick' })}>
                <b>{QUICK_SESSION_LIMIT}장</b>만
              </button>
              <button type="button" className="toast-close" onClick={() => setNudge(false)}>
                닫기
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
