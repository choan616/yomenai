// 세션 종료 화면 — 리포트의 축소판과 "오늘의 발견" 한 줄.
// 숫자 하나로 끝내지 않는다. 매 세션이 진단 도구라는 정체성을 다시 확인하는 자리다 (PLAN §7)
import { useEffect, useState, type ReactNode } from 'react'
import {
  buildSessionSummary,
  type Finding,
  type SessionSummary as Summary,
} from '../core/sessionSummary.ts'
import type { LearningEvent } from '../core/types.ts'
import { loadPairs, type RuntimeIdiom } from '../dict/load.ts'
import { MISTAKE_LABEL } from './mistakeLabels.ts'

export function SessionSummary({
  events,
  pool,
  onExit,
}: {
  events: { prior: LearningEvent[]; session: LearningEvent[] }
  pool: RuntimeIdiom[]
  onExit: () => void
}) {
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    let alive = true
    void loadPairs().then((pairs) => {
      if (!alive) return
      const byId = new Map(pool.map((p) => [p.idiomId, p]))
      // 음독 하나가 열어주는 숙어 수 — 풀을 한 번 훑어 역색인을 만든다
      const unlocks = new Map<string, number>()
      for (const it of pool) {
        for (const pairId of it.pairIds) unlocks.set(pairId, (unlocks.get(pairId) ?? 0) + 1)
      }
      setSummary(
        buildSessionSummary({
          prior: events.prior,
          session: events.session,
          pairsOf: (id) => byId.get(id)?.pairIds ?? [],
          pairs,
          nameOf: (id) => {
            const it = byId.get(id)
            return it ? { headword: it.headword, reading: it.reading } : undefined
          },
          unlocksOf: (pairId) => unlocks.get(pairId) ?? 0,
        }),
      )
    })
    return () => {
      alive = false
    }
  }, [events, pool])

  const done = summary ?? { total: 0, correct: 0, newPairs: 0, topMistake: null, trend: [], finding: null }

  return (
    <div className="centered summary-screen">
      <h2>세션 완료</h2>

      <p className="summary-num">
        {done.correct} <span className="summary-slash">/</span> {done.total}
      </p>

      <dl className="summary-stats">
        <div>
          <dt>정답률</dt>
          <dd>{done.total > 0 ? Math.round((done.correct / done.total) * 100) : 0}%</dd>
        </div>
        <div>
          <dt>새 음독</dt>
          <dd>{done.newPairs}</dd>
        </div>
        <div>
          <dt>주 오답</dt>
          <dd className="dd-label">
            {done.topMistake ? MISTAKE_LABEL[done.topMistake.type] : '없음'}
          </dd>
        </div>
      </dl>

      {done.topMistake && done.trend.length >= 2 && (
        <Trend trend={done.trend} label={MISTAKE_LABEL[done.topMistake.type]} />
      )}

      {done.finding && <FindingLine finding={done.finding} />}

      <button type="button" className="btn-primary" onClick={onExit}>
        홈으로
      </button>
    </div>
  )
}

/** 최근 세션별 발생 수를 작은 막대로. 리포트 차트의 축소판이다 */
function Trend({ trend, label }: { trend: number[]; label: string }) {
  const max = Math.max(1, ...trend)
  return (
    <div className="trend">
      <p className="trend-label">
        {label} <span className="dim">최근 {trend.length}세션</span>
      </p>
      <div className="trend-bars" role="img" aria-label={`${label} 최근 추이 ${trend.join(', ')}`}>
        {trend.map((n, i) => (
          <span
            key={i}
            className={`trend-bar${i === trend.length - 1 ? ' now' : ''}`}
            style={{ '--h': n / max, '--i': i } as React.CSSProperties}
          >
            <b>{n}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 오늘의 발견 — 한 줄. 여러 개를 늘어놓으면 대시보드가 되고 읽히지 않는다.
 * 문구는 서술이 아니라 관찰이다. 앱이 사용자를 보고 알아낸 것을 말한다.
 */
function FindingLine({ finding }: { finding: Finding }) {
  return (
    <p className="finding">
      <span className="finding-tag">오늘의 발견</span>
      <span className="finding-text">{findingText(finding)}</span>
    </p>
  )
}

function findingText(f: Finding): ReactNode {
  switch (f.kind) {
    case 'CLEAN_RUN':
      return (
        <>
          <b>{f.total}장 전부 정답</b> — 이 구간은 더 어려운 밴드를 볼 때가 됐다
        </>
      )
    case 'MISTAKE_TREND':
      return f.direction === 'down' ? (
        <>
          <b>{MISTAKE_LABEL[f.type]}</b> 오답이 {f.sessions}세션 연속 줄고 있다
        </>
      ) : (
        <>
          <b>{MISTAKE_LABEL[f.type]}</b> 오답이 {f.sessions}세션 연속 늘고 있다
        </>
      )
    case 'KO_INTERFERENCE':
      return (
        <>
          한국 한자음에 이끌린 오답 <b>{f.count}회</b> —{' '}
          <span lang="ja">{f.headword}</span>
          <span className="dim"> ({f.reading})</span>
        </>
      )
    case 'ONYOMI_UNLOCKED':
      return (
        <>
          <span lang="ja">
            {f.kanji} {f.base}
          </span>
          를 처음 맞혔다 — 이 {f.onKind === 'on' ? '음' : '훈'}독을 쓰는 숙어가{' '}
          <b>{f.unlocks}개</b>
        </>
      )
    case 'WEAK_ONYOMI':
      return (
        <>
          <span lang="ja">
            {f.kanji} {f.base}
          </span>
          에서 {f.seen}번 중 <b>{f.wrong}번</b> 틀렸다
        </>
      )
  }
}
