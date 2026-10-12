// 음독 맵 화면 — (한자, 음독) 숙달 현황. 화면 낱말은 「읽는 법」, 코드 낱말은 pair (PLAN §7)
import { useEffect, useMemo, useState } from 'react'
import { replay } from '../core/replay.ts'
import {
  MASTERY_MAX_WRONG_RATE,
  MASTERY_MIN_SEEN,
  pairRows,
  summarize,
  type OnyomiMasterySummary,
  type PairRow,
} from '../core/onyomiMap.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadKanji, loadPairs } from '../dict/load.ts'
import { loadStudyPool, withRuntimePairs } from '../dict/pool.ts'
import { READING_STABLE_DAYS, stableReadingCount } from '../core/level.ts'
import { loadSettings } from './settings.ts'

const STATUS_ICON: Record<PairRow['status'], string> = { mastered: '●', learning: '◐', unseen: '○' }
const STATUS_LABEL: Record<PairRow['status'], string> = {
  mastered: '숙달',
  learning: '학습 중',
  unseen: '미학습',
}

export function OnyomiMap({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<PairRow[] | null>(null)
  /**
   * 표현으로 센 숙지 수 (2026-09-23 사용자 보고 「음독맵의 숫자와 밴드의 숫자가 다르다」).
   *
   * 두 화면이 **다른 단위**로 센다 — 표현 하나(明白)가 쌍 둘(明:めい·白:はく)로 쪼개지고,
   * 쌍 하나(明:めい)는 52개 표현에 걸친다. 사전 전체로는 표현 16,959개 = 쌍 2,995개다.
   * 숫자가 다른 게 정상인데 화면이 그걸 안 밝혀서 어긋난 것으로 보였다. 여기 한 줄로 밝힌다
   */
  const [stableIdioms, setStableIdioms] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [basePairs, kanji, events] = await Promise.all([
          loadPairs(),
          loadKanji(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        // **세션과 같은 풀을 쓴다** (2026-09-26). 전에는 `base.json` 만 봐서 담아 둔
        // 밴드 4 를 공부해도 여기엔 안 잡혔다 — 채점은 쌓이는데 분모에 없었다.
        // 담은 것을 알아야 풀을 만들 수 있어 재생을 두 번 돈다 (두 번째가 집계용이다)
        const { pool: learn } = await loadStudyPool({
          starred: replay(events).starred,
          includeKun: loadSettings().kunPercent > 0,
          kanji,
        })
        if (!alive) return
        const byId = new Map(learn.map((p) => [p.idiomId, p]))
        const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
        // 들인 말의 쌍은 `pairs.json` 에 없다 — 런타임에 만들어진 것이라 채워 넣는다
        const pairs = withRuntimePairs(basePairs, learn)
        // 분모는 **앞으로 출제될 범위와 같아야** 한다 (2026-09-23 사용자 보고). 훈독을 꺼
        // 놓으면(기본값 `kunPercent: 0`) 그 숙어는 안 나오는데, 여기만 `studyPool` 을 안 써서
        // 훈독에서만 오는 388쌍(전체의 13%, 실측)이 영영 「미학습」으로 분모에 앉아 있었다.
        // 진단·홈·리포트·세션은 모두 이 필터를 쓴다.
        //
        // **재생(`replay`)은 안 거른다.** 지난 기록은 그때 설정으로 쌓인 것이라 지우면 안
        // 되고, 걸러야 할 것은 「무엇을 셀 것인가」(분모)다
        const inPool = new Set(learn.map((p) => p.idiomId))
        setRows(pairRows(learn.flatMap((p) => p.pairIds), pairs, state))
        // 밴드 사다리와 **같은 함수**로 센다. 두 자리에서 따로 세면 언젠가 갈라진다
        setStableIdioms(stableReadingCount(state.cards, (id) => inPool.has(id)))
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const summary: OnyomiMasterySummary | null = useMemo(
    () => (rows ? summarize(rows) : null),
    [rows],
  )
  const visible = useMemo(
    () => (rows ? (showAll ? rows : rows.filter((r) => r.status === 'learning')) : []),
    [rows, showAll],
  )

  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ←
        </button>
        <h2>음독 맵</h2>
      </div>

      <div className="screen-body">
        {error ? (
          <p className="empty">불러오지 못했어요: {error}</p>
        ) : !summary ? (
          <p className="empty">불러오고 있어요…</p>
        ) : (
          <>
            <div>
              {/* 단위를 **읽는 법**이라고 부르고 보기를 붙인다 (2026-10-12). 「음독 N개」라고만 하면
                  리포트의 「숙지한 표현 N개」와 같은 자로 읽히고(2026-09-23), 「쌍」은 한자 둘의
                  조합으로 읽혀 사용자가 세 번 되물었다 */}
              <p className="stat-big">
                읽는 법 {summary.total}개 중 <b>{summary.mastered}</b>개 숙달
              </p>
              <div className="meter" aria-hidden="true">
                <span style={{ width: pct(summary.mastered, summary.total) }} />
              </div>
              <p className="stat-line">
                학습 중 {summary.learning} · 미학습 {summary.unseen}
              </p>
              {/* 다른 자로 잰 수치를 나란히 둔다 — 두 화면이 서로를 밝힌다 (사용자 선택) */}
              <p className="unit-note">
                <span lang="ja">明</span> 를 <span lang="ja">めい</span> 로 읽는 법이 하나예요 —
                같은 글자를 <span lang="ja">みょう</span> 로 읽으면 또 하나고요. 표현으로는{' '}
                {stableIdioms}개 숙지예요. 표현 하나가 읽는 법 여러 개로 쪼개지고, 읽는 법
                하나는 여러 표현에 걸쳐요 — 그래서 두 수가 달라요
              </p>
            </div>

            <div>
              <p className="section-title">{showAll ? '읽는 법 전체' : '학습 중인 읽는 법'}</p>
              {/* 잣대도 다르다 — 읽는 법은 정확도(오답률), 표현은 시간(안 잊은 날수)을 본다 */}
              <p className="unit-note">
                읽는 법은 {MASTERY_MIN_SEEN}회 이상 보고 오답률 {Math.round(MASTERY_MAX_WRONG_RATE * 100)}%
                이하면 숙달이에요 · 표현은 {READING_STABLE_DAYS}일 이상 안 잊으면 숙지예요
              </p>
              {visible.length === 0 ? (
                <p className="empty">
                  {showAll ? '표시할 읽는 법이 없어요.' : '오답률이 높은 음독이 아직 없어요.'}
                </p>
              ) : (
                <ul className="rows">
                  {visible.map((r) => (
                    <li key={r.pairId}>
                      <span className={`st ${r.status}`} aria-hidden="true">
                        {STATUS_ICON[r.status]}
                      </span>
                      <span className="r-main" lang="ja">
                        {r.kanji}
                      </span>
                      <span className="r-sub r-ja" lang="ja">
                        {r.base}
                      </span>
                      <span className="r-sub">{r.kind === 'on' ? '음' : '훈'}</span>
                      <span className="r-tail">
                        {STATUS_LABEL[r.status]}
                        {r.seen > 0 && ` · ${r.wrong}/${r.seen}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                className="btn"
                style={{ marginTop: 12, width: '100%' }}
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? '학습 중인 것만 보기' : `전체 보기 (${summary.total})`}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}

function pct(n: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((n / total) * 100)}%`
}
