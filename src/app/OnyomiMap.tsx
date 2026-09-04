// 음독 맵 화면 — (한자, 음독) 쌍 숙달 현황. "숙어 N개" 대신 "음독 M개 중 K개 숙달" (PLAN §7)
import { useEffect, useMemo, useState } from 'react'
import { replay } from '../core/replay.ts'
import {
  pairRows,
  summarize,
  type OnyomiMasterySummary,
  type PairRow,
} from '../core/onyomiMap.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadPairs } from '../dict/load.ts'

const STATUS_ICON: Record<PairRow['status'], string> = { mastered: '●', learning: '◐', unseen: '○' }
const STATUS_LABEL: Record<PairRow['status'], string> = {
  mastered: '숙달',
  learning: '학습 중',
  unseen: '미학습',
}

export function OnyomiMap({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<PairRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, pairs, events] = await Promise.all([
          loadBaseIdioms(),
          loadPairs(),
          listEvents(db(), LOCAL_USER_ID),
        ])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
        setRows(pairRows(pool.flatMap((p) => p.pairIds), pairs, state))
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
        <button type="button" className="back" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <h2>음독 맵</h2>
      </div>

      <div className="screen-body">
        {error ? (
          <p className="empty">불러오지 못했습니다: {error}</p>
        ) : !summary ? (
          <p className="empty">불러오는 중…</p>
        ) : (
          <>
            <div>
              <p className="stat-big">
                음독 {summary.total}개 중 <b>{summary.mastered}</b>개 숙달
              </p>
              <div className="meter" aria-hidden="true">
                <span style={{ width: pct(summary.mastered, summary.total) }} />
              </div>
              <p className="stat-line">
                학습 중 {summary.learning} · 미학습 {summary.unseen}
              </p>
            </div>

            <div>
              <p className="section-title">{showAll ? '전체 쌍' : '학습 중인 쌍'}</p>
              {visible.length === 0 ? (
                <p className="empty">
                  {showAll ? '표시할 쌍이 없습니다.' : '오답률이 높은 음독이 아직 없습니다.'}
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
                {showAll ? '학습 중인 쌍만 보기' : `전체 쌍 보기 (${summary.total})`}
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
