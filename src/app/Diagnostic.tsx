// 진입 진단 화면 — 밴드별 무작위 표본을 읽기로 출제해 숙달 수준을 추정한다 (PLAN §6)
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  bandVerdict,
  DIAGNOSTIC_PER_BAND,
  diagnosticSummary,
  pickDiagnostic,
  type BandEstimate,
} from '../core/diagnostic.ts'
import { isCorrectReading, recordReadingAnswer } from '../core/session.ts'
import { BAND_LABEL, type Band } from '../lib/bands.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent, listEvents } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadBaseIdioms, loadKanji, type RuntimeIdiom } from '../dict/load.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import type { MistakeContext } from '../core/mistakes.ts'
import { KanaInput } from '../study/KanaInput.tsx'
import { useViewportLock } from '../study/useViewportLock.ts'
import { markDiagnosticDone } from './diagnostic-state.ts'

// Phase 9-B: '뜻 알았나요?'(known) 단계 제거. 진단은 순수 읽기 검사가 되고,
// 뜻 질문은 실제 세션의 지연 검수(needsClassReview)로 미룬다.
type Phase = 'loading' | 'error' | 'ask' | 'result'

export function Diagnostic({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  useViewportLock()
  const [phase, setPhase] = useState<Phase>('loading')
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<RuntimeIdiom[]>([])
  const [idx, setIdx] = useState(0)
  const [summary, setSummary] = useState<BandEstimate[]>([])

  const mistakes = useRef<MistakeContext | null>(null)
  const bandOf = useRef<(id: string) => Band | undefined>(() => undefined)
  const shownAt = useRef(0)
  const ctxBase = useRef({ userId: LOCAL_USER_ID, deviceId: getDeviceId() })
  // 현재 밴드의 누적 — 적응형 조기 종료 판정에 쓴다 (Phase 9-B)
  const bandSeen = useRef(0)
  const bandWrong = useRef(0)

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
  const bandStart = q ? questions.findIndex((it) => it.band === q.band) : 0
  const inBand = idx - bandStart + 1 // 현재 밴드에서 몇 번째 문항인지 (1-based)

  const ctx = () => ({
    ...ctxBase.current,
    at: Date.now(),
    elapsedMs: Math.round(performance.now() - shownAt.current),
  })

  const finish = async () => {
    markDiagnosticDone()
    const events = await listEvents(db(), LOCAL_USER_ID)
    setSummary(diagnosticSummary(events, bandOf.current))
    setPhase('result')
  }

  const goTo = (nextIdx: number) => {
    if (questions[nextIdx].band !== questions[idx].band) {
      bandSeen.current = 0
      bandWrong.current = 0
    }
    setIdx(nextIdx)
    setPhase('ask')
    shownAt.current = performance.now()
  }

  /** 방금 답의 정오답을 받아 다음 문항을 정한다. 밴드 결론이 서면 그 밴드를 건너뛰거나 진단을 끝낸다 */
  const advance = (correct: boolean) => {
    bandSeen.current++
    if (!correct) bandWrong.current++
    const verdict = bandVerdict(bandSeen.current, bandWrong.current)

    if (verdict === 'endDiagnostic') {
      void finish()
      return
    }
    const answeredBand = questions[idx].band
    const nextIdx =
      verdict === 'nextBand'
        ? questions.findIndex((it) => it.band > answeredBand) // 다음 밴드 첫 문항
        : idx + 1
    if (nextIdx < 0 || nextIdx >= questions.length) {
      void finish()
      return
    }
    goTo(nextIdx)
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
    advance(correct)
  }

  if (phase === 'loading') return <Centered>진단 문항을 준비하고 있어요…</Centered>
  if (phase === 'error') {
    return (
      <Centered>
        <p>진단을 시작하지 못했어요.</p>
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
        {/* 적응형이라 총 문항 수를 미리 못 준다 (Phase 9-B). 밴드 안에서의 진행만 보여준다 */}
        <progress value={inBand - 1} max={DIAGNOSTIC_PER_BAND} />
        <span className="count">
          밴드 {q?.band ?? '-'} · {inBand}
        </span>
      </header>

      <main className="study-main">
        {q && phase === 'ask' && (
          <div className="card">
            <div className="card-head">
              <span className="tag">진입 진단 · 밴드 {q.band}</span>
            </div>
            <div className="card-body">
              <p className="headword" lang="ja">
                {q.headword}
              </p>
            </div>
            <div className="card-bottom">
              <KanaInput resetKey={q.idiomId} onSubmit={submitReading} />
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
            ? `밴드 ${firstShaky.band}부터 읽기가 조금 흔들리네요. 여기서 시작할게요.`
            : '표본 구간은 안정적이에요. 밴드 1부터 순서대로 볼게요.'}
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
