// 진단 리포트 화면 — 오답 유형 분포, 한국음 간섭, 취약 음독. 이 앱의 얼굴이다 (PLAN §7)
import { useEffect, useState } from 'react'
import { replay } from '../core/replay.ts'
import { buildReport, type Report as ReportData } from '../core/report.ts'
import { LOCAL_USER_ID, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadPairs } from '../dict/load.ts'
import { MISTAKE_LABEL } from '../study/mistakeLabels.ts'

export function Report({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

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
        setData(
          buildReport(state, pairs, (id) => {
            const it = byId.get(id)
            return it ? { headword: it.headword, reading: it.reading } : undefined
          }),
        )
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="screen report">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <h2>진단 리포트</h2>
      </div>

      <div className="screen-body">
        {error ? (
          <p className="empty">불러오지 못했습니다: {error}</p>
        ) : !data ? (
          <p className="empty">불러오는 중…</p>
        ) : data.totalReviews === 0 ? (
          <p className="empty">
            아직 진단할 기록이 없습니다.
            <br />
            세션을 완료하면 오답 패턴이 여기 쌓입니다.
          </p>
        ) : (
          <ReportBody data={data} />
        )}
      </div>
    </section>
  )
}

function ReportBody({ data }: { data: ReportData }) {
  const top = data.mistakes[0]
  const accuracy =
    data.totalReviews > 0
      ? Math.round(((data.totalReviews - data.totalMistakes) / data.totalReviews) * 100)
      : 100
  const maxCount = Math.max(1, ...data.mistakes.map((m) => m.count))

  return (
    <>
      <p className="report-lead">
        읽기 <b>{data.totalReviews}</b>회 중 오답 <b>{data.totalMistakes}</b>회
        <span className="dim"> · 정답률 {accuracy}%</span>
        {top && (
          <>
            <br />
            가장 잦은 오답은 <b>{MISTAKE_LABEL[top.type]}</b>
            <span className="dim">
              {' '}
              — 전체 오답의 {Math.round((top.count / (data.totalMistakes || 1)) * 100)}%
            </span>
          </>
        )}
      </p>

      <section>
        <p className="section-title">오답 유형 분포</p>
        {data.mistakes.length === 0 ? (
          <p className="empty">오답이 없습니다.</p>
        ) : (
          <div className="bars">
            {data.mistakes.map((m) => (
              <div className="bar-row" key={m.type}>
                <span>{MISTAKE_LABEL[m.type]}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill"
                    style={{ width: `${(m.count / maxCount) * 100}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="bar-num">{m.count}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="ko-callout">
        <p className="section-title">한국음 간섭</p>
        <p className="ko-big">
          <b>{data.koInterferenceCount}</b>
          <span className="dim"> 회 — 한국 한자음에 이끌린 오답</span>
        </p>
        {data.koInterferenceIdioms.length === 0 ? (
          <p className="dim">해당 숙어가 아직 없습니다.</p>
        ) : (
          <ul className="rows">
            {data.koInterferenceIdioms.map((it) => (
              <li key={it.id}>
                <span className="r-main" lang="ja">
                  {it.headword}
                </span>
                <span className="r-sub r-ja" lang="ja">
                  {it.reading}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <p className="section-title">취약 음독</p>
        {data.weakOnyomi.length === 0 ? (
          <p className="empty">오답률이 높은 음독이 아직 없습니다.</p>
        ) : (
          <ul className="rows">
            {data.weakOnyomi.map((w) => (
              <li key={w.pairId}>
                <span className="st learning" aria-hidden="true">
                  ◐
                </span>
                <span className="r-main" lang="ja">
                  {w.kanji}
                </span>
                <span className="r-sub r-ja" lang="ja">
                  {w.base}
                </span>
                <span className="r-sub">{w.kind === 'on' ? '음' : '훈'}</span>
                <span className="r-tail">
                  {Math.round(w.rate * 100)}% · {w.wrong}/{w.seen}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
