// 진입 진단 화면 — 밴드별 무작위 표본을 읽기로 출제해 숙달 수준을 추정한다 (PLAN §6)
import { useEffect, useMemo, useRef, useState } from 'react'
import { diagnosticSummary, pickDiagnostic, type BandEstimate } from '../core/diagnostic.ts'
import { isCorrectReading, recordMeaningKnown, recordReadingAnswer } from '../core/session.ts'
import { BAND_LABEL, type Band } from '../lib/bands.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji, type RuntimeIdiom } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import type { MistakeContext } from '../core/mistakes.ts'
import { KanaInput } from '../study/KanaInput.tsx'
import { markDiagnosticDone } from './diagnostic-state.ts'

type Phase = 'loading' | 'error' | 'ask' | 'known' | 'result'

export function Diagnostic({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<RuntimeIdiom[]>([])
  const [idx, setIdx] = useState(0)
  const [summary, setSummary] = useState<BandEstimate[]>([])

  const mistakes = useRef<MistakeContext | null>(null)
  const bandOf = useRef<(id: string) => Band | undefined>(() => undefined)
  const shownAt = useRef(0)
  const ctxBase = useRef({ userId: LOCAL_USER_ID, deviceId: getDeviceId() })

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pool, kanji] = await Promise.all([loadBaseIdioms(), loadKanji()])
        if (!alive) return
        const byId = new Map(pool.map((p) => [p.idiomId, p]))
        bandOf.current = (id) => byId.get(id)?.band
        mistakes.current = mistakeContextFromKanji(kanji)
        setQuestions(pickDiagnostic(pool))
        setPhase('ask')
        shownAt.current = performance.now()
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : String(e))
          setPhase('error')
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const q = questions[idx]

  const ctx = () => ({
    ...ctxBase.current,
    at: Date.now(),
    elapsedMs: Math.round(performance.now() - shownAt.current),
  })

  const advance = async () => {
    const nextIdx = idx + 1
    if (nextIdx >= questions.length) {
      markDiagnosticDone()
      const events = await listEvents(db(), LOCAL_USER_ID)
      setSummary(diagnosticSummary(events, bandOf.current))
      setPhase('result')
      return
    }
    setIdx(nextIdx)
    setPhase('ask')
    shownAt.current = performance.now()
  }

  const submitReading = (answer: string) => {
    if (!q || !mistakes.current) return
    const correct = isCorrectReading(q.reading, answer)
    void appendEvent(
      db(),
      recordReadingAnswer({
        item: { idiomId: q.idiomId, cardType: 'reading', mode: 'correction', due: false },
        headword: q.headword,
        reading: q.reading,
        answer,
        ctx: ctx(),
        mistakes: mistakes.current,
      }),
    )
    if (correct) void advance()
    else setPhase('known')
  }

  const answerKnown = (known: boolean) => {
    if (!q) return
    void appendEvent(db(), recordMeaningKnown({ idiomId: q.idiomId, known, ctx: ctx() }))
    void advance()
  }

  if (phase === 'loading') return <Centered>진단 문항을 준비하는 중…</Centered>
  if (phase === 'error') {
    return (
      <Centered>
        <p>진단을 시작하지 못했습니다.</p>
        <p className="dim">{error}</p>
        <button type="button" className="btn" onClick={onExit}>
          홈으로
        </button>
      </Centered>
    )
  }
  if (phase === 'result') {
    return <ResultView summary={summary} onDone={onDone} onExit={onExit} />
  }

  return (
    <div className="diag">
      <header className="study-bar">
        <button type="button" className="link" onClick={onExit} aria-label="진단 나가기">
          ✕
        </button>
        <progress value={idx} max={questions.length} />
        <span className="count">
          {idx} / {questions.length}
        </span>
      </header>

      <main className="study-main">
        {q && phase === 'ask' && (
          <div className="card">
            <div className="card-head">
              <span className="tag">진입 진단 · 밴드 {q.band}</span>
            </div>
            <p className="headword" lang="ja">
              {q.headword}
            </p>
            <div className="card-bottom">
              <KanaInput key={q.idiomId} onSubmit={submitReading} />
            </div>
          </div>
        )}
        {q && phase === 'known' && (
          <div className="card">
            <div className="card-head">
              <span className="tag">확인</span>
            </div>
            <p className="prompt-q">이 숙어의 뜻을 알고 계셨나요?</p>
            <p className="headword" lang="ja">
              {q.headword}
            </p>
            <p className="reading-shown" lang="ja">
              {q.reading}
            </p>
            <div className="card-bottom">
              <div className="answer-row">
                <button type="button" className="btn" onClick={() => answerKnown(false)}>
                  몰랐다
                </button>
                <button type="button" className="btn-primary" onClick={() => answerKnown(true)}>
                  알고 있었다
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function ResultView({
  summary,
  onDone,
  onExit,
}: {
  summary: BandEstimate[]
  onDone: () => void
  onExit: () => void
}) {
  const firstShaky = useMemo(
    () => summary.find((b) => b.seen > 0 && b.correct / b.seen < 0.8),
    [summary],
  )

  return (
    <section className="screen">
      <div className="screen-bar">
        <h2>진단 완료</h2>
      </div>
      <div className="screen-body">
        <p className="report-lead">
          {firstShaky
            ? `밴드 ${firstShaky.band} 부터 읽기가 흔들립니다. 이 구간을 시작점으로 잡습니다.`
            : '표본 구간의 읽기는 안정적입니다. 밴드 1 부터 순서대로 도입합니다.'}
        </p>

        <div className="bars">
          {summary.map((b) => {
            const pct = b.seen > 0 ? Math.round((b.correct / b.seen) * 100) : 0
            return (
              <div className="bar-row" key={b.band} title={BAND_LABEL[b.band]}>
                <span>밴드 {b.band}</span>
                <span className="bar-track">
                  <span
                    className="bar-fill ok"
                    style={{ width: `${pct}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="bar-num">{pct}%</span>
              </div>
            )
          })}
        </div>
        <p className="stat-line">
          {summary.map((b) => `밴드 ${b.band} ${b.correct}/${b.seen}`).join(' · ')}
        </p>

        <div className="answer-row">
          <button type="button" className="btn" onClick={onExit}>
            홈으로
          </button>
          <button type="button" className="btn-primary wide" onClick={onDone}>
            진단 리포트 보기
          </button>
        </div>
      </div>
    </section>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="centered">{children}</div>
}
