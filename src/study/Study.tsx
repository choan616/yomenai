// 학습 세션 화면 — 카드 순회, 진행률, 종료 요약. 카드 전환은 150ms 이하를 목표로 한다 (PLAN §7)
import { useLayoutEffect } from 'react'
import { ClassReviewPrompt } from './ClassReviewPrompt.tsx'
import { MeaningCard } from './MeaningCard.tsx'
import { ReadingCard } from './ReadingCard.tsx'
import { SessionSummary } from './SessionSummary.tsx'
import { useStudySession, type SessionKind } from './useStudySession.ts'

export function Study({ kind = 'normal', onExit }: { kind?: SessionKind; onExit: () => void }) {
  const [s, a] = useStudySession(kind)

  // 카드 전환 실측. transitionSeq 는 advance 때만 오르고, useStudySession 이 그 직전에
  // 'yomenai:advance' 를 마킹한다. 단일 rAF 로 DOM 커밋·레이아웃 뒤 페인트 직전에 measure 한다.
  useLayoutEffect(() => {
    if (s.transitionSeq === 0) return
    const id = requestAnimationFrame(() => {
      performance.mark('yomenai:shown')
      performance.measure('yomenai:transition', 'yomenai:advance', 'yomenai:shown')
    })
    return () => cancelAnimationFrame(id)
  }, [s.transitionSeq])

  if (s.status === 'loading') {
    return <Centered>불러오고 있어요…</Centered>
  }
  if (s.status === 'error') {
    return (
      <Centered>
        <p>세션을 시작하지 못했어요.</p>
        <p className="dim">{s.error}</p>
        <button type="button" className="btn" onClick={onExit}>
          홈으로
        </button>
      </Centered>
    )
  }
  if (s.status === 'done') {
    if (s.progress.total === 0) {
      return (
        <Centered>
          <p>다시 볼 카드가 없어요.</p>
          <p className="dim">틀린 숙어가 쌓이면 여기서 다시 만나요.</p>
          <button type="button" className="btn-primary" onClick={onExit}>
            홈으로
          </button>
        </Centered>
      )
    }
    return <SessionSummary events={s.events} pool={s.pool} onExit={onExit} />
  }

  return (
    <div className="study">
      <header className="study-bar">
        <button type="button" className="link" onClick={onExit} aria-label="세션 나가기">
          ✕
        </button>
        <progress value={s.progress.index} max={s.progress.total} />
        <span className="count">
          {s.progress.index} / {s.progress.total}
        </span>
      </header>

      <main className="study-main">
        {s.status === 'classReview' && s.idiom && (
          <ClassReviewPrompt idiom={s.idiom} onAnswer={a.answerClassReview} />
        )}
        {(s.status === 'reading' || s.status === 'reading-feedback') && s.idiom && (
          <ReadingCard
            idiom={s.idiom}
            feedback={s.feedback}
            onSubmit={a.submitReading}
            onNext={a.next}
          />
        )}
        {(s.status === 'meaning' || s.status === 'meaning-feedback') && s.idiom && (
          <MeaningCard
            idiom={s.idiom}
            graded={s.status === 'meaning-feedback'}
            onGrade={a.submitMeaning}
            onNext={() => a.next()}
          />
        )}
      </main>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="centered">{children}</div>
}
