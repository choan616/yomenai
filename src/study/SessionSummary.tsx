// 세션 종료 화면 — 리포트의 축소판과 "오늘의 발견" 한 줄.
// 숫자 하나로 끝내지 않는다. 매 세션이 진단 도구라는 정체성을 다시 확인하는 자리다 (PLAN §7)
import { useEffect, useState, type ReactNode } from 'react'
import { nextUp, type NextUp } from '../core/nextUp.ts'
import { correctReadings, pickReadable } from '../core/readable.ts'
import { buildSession } from '../core/session.ts'
import {
  buildSessionSummary,
  type Finding,
  type SessionSummary as Summary,
} from '../core/sessionSummary.ts'
import type { LearningEvent } from '../core/types.ts'
import { loadExamples, loadPairs, type RuntimeIdiom } from '../dict/load.ts'
import { loadSettings } from '../app/settings.ts'
import { MISTAKE_LABEL } from './mistakeLabels.ts'

/** 화면에 얹을 때 필요한 이름까지 붙인 "읽히는 문장" */
interface ReadableView {
  sentence: string
  headword: string
  reading: string
}

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
  const [preview, setPreview] = useState<NextUp | null>(null)
  const [readable, setReadable] = useState<ReadableView | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([loadPairs(), loadExamples()]).then(([pairs, examples]) => {
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

      // 예고 — 다음 세션을 실제로 한 번 짜서 가장 자주 나올 음독을 센다. 짐작이 아니다
      const { sessionLimit, ratio } = loadSettings()
      const next = buildSession(pool, [...events.prior, ...events.session], {
        now: Date.now(),
        limit: sessionLimit,
        ratio,
      })
      setPreview(nextUp(next.cards, (id) => byId.get(id)?.pairIds ?? [], pairs))

      // 읽히는 문장 — 오늘 맞힌 숙어가 든 예문 중 가장 짧은 것
      const r = pickReadable(correctReadings(events.session), examples)
      const it = r ? byId.get(r.idiomId) : undefined
      setReadable(
        r && it ? { sentence: r.sentence, headword: it.headword, reading: it.reading } : null,
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

      {readable && <ReadableBlock readable={readable} />}

      {preview && <NextUpLine next={preview} />}

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
        {label} <span className="dim">최근 {trend.length}세션이에요</span>
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
          <b>{f.total}장 다 맞혔어요.</b> 다음엔 한 단계 위를 볼까요?
        </>
      )
    case 'MISTAKE_TREND':
      return f.direction === 'down' ? (
        <>
          <b>{MISTAKE_LABEL[f.type]}</b> 오답이 {f.sessions}세션 연속 줄고 있어요. 잘 가고 있어요
        </>
      ) : (
        <>
          <b>{MISTAKE_LABEL[f.type]}</b> 오답이 {f.sessions}세션 연속 늘고 있어요. 여기 한 번 볼까요?
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
          를 처음 맞혔어요. 이 {f.onKind === 'on' ? '음' : '훈'}독을 쓰는 숙어가{' '}
          <b>{f.unlocks}개</b>예요
        </>
      )
    case 'WEAK_ONYOMI':
      return (
        <>
          <span lang="ja">
            {f.kanji} {f.base}
          </span>
          , {f.seen}번 중 <b>{f.wrong}번</b> 틀렸어요. 다음에 만나면 눈여겨볼까요?
        </>
      )
  }
}

/**
 * 오늘 맞힌 것으로 읽히는 문장.
 *
 * 학습의 보상을 점수가 아니라 **실제로 읽히는 경험**으로 준다. 뜻은 아는데 못 읽는
 * 사람이 대상이니(PLAN §0) 문장 하나가 술술 읽히는 순간이 이 앱이 줄 수 있는 증거다.
 * 무번역 예문이라 뜻은 안 준다 — 여기서 필요한 건 뜻이 아니다.
 */
function ReadableBlock({ readable }: { readable: ReadableView }) {
  return (
    <div className="readable">
      <p className="readable-tag">오늘 맞힌 것으로 읽히는 문장</p>
      <p className="readable-text" lang="ja">
        <Marked text={readable.sentence} mark={readable.headword} />
      </p>
      <p className="readable-src">
        <span lang="ja">{readable.headword}</span>
        <span className="dim" lang="ja">
          {' '}
          {readable.reading}
        </span>
      </p>
    </div>
  )
}

/** 문장 안의 그 숙어만 도드라지게. 없으면 문장 그대로 */
function Marked({ text, mark }: { text: string; mark: string }) {
  const i = text.indexOf(mark)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <b>{mark}</b>
      {text.slice(i + mark.length)}
    </>
  )
}

/**
 * 예고 — 끝맺지 않고 남겨둔다. 보상이 아니라 약속이라 "발견" 축을 안 벗어난다.
 * 다음 세션을 실제로 짜서 센 값이라 빗나가지 않는다 (`nextUp`).
 */
function NextUpLine({ next }: { next: NextUp }) {
  return (
    <p className="next-up">
      <span className="next-up-tag">다음 예고</span>
      <span className="next-up-text">
        <span lang="ja">
          {next.kanji} {next.base}
        </span>
        <span className="dim"> {next.kind === 'on' ? '음독' : '훈독'}</span> — 다음 세션에{' '}
        <b>{next.count}번</b> 나와요
      </span>
    </p>
  )
}
