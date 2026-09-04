// 읽기 교정 카드 — 숙어 제시 → 히라가나 입력. 객관식이 아니다 (PLAN §6)
import { useState } from 'react'
import type { Confidence } from '../core/scheduler.ts'
import type { RuntimeIdiom } from '../dict/load.ts'
import type { ReadingFeedback } from './useStudySession.ts'
import { KanaInput } from './KanaInput.tsx'
import { MistakeDetail } from './MistakeDetail.tsx'
import { MISTAKE_LABEL } from './mistakeLabels.ts'
import { tts } from './tts.ts'

interface Props {
  idiom: RuntimeIdiom
  feedback?: ReadingFeedback
  onSubmit: (answer: string) => void
  onNext: (confidence?: Confidence) => void
}

export function ReadingCard({ idiom, feedback, onSubmit, onNext }: Props) {
  if (feedback) {
    return <Feedback idiom={idiom} feedback={feedback} onNext={onNext} />
  }
  return (
    <div className="card">
      <div className="card-head">
        <span className="tag">읽기 · 밴드 {idiom.band}</span>
      </div>
      <p className="headword" lang="ja">
        {idiom.headword}
      </p>
      <div className="card-bottom">
        <KanaInput key={idiom.idiomId} onSubmit={onSubmit} />
      </div>
    </div>
  )
}

function Feedback({
  idiom,
  feedback,
  onNext,
}: {
  idiom: RuntimeIdiom
  feedback: ReadingFeedback
  onNext: (confidence?: Confidence) => void
}) {
  const { correct, expected, mistakeType, answer } = feedback
  const [detail, setDetail] = useState(false)

  if (detail) {
    return <MistakeDetail idiom={idiom} onClose={() => setDetail(false)} />
  }

  return (
    <div className={`card feedback ${correct ? 'is-ok' : 'is-ng'}`}>
      <div className="card-head">
        <span className="verdict">
          <span aria-hidden="true">{correct ? '✓' : '✗'}</span>
          {correct ? '정답' : '오답'}
        </span>
      </div>
      <p className="headword" lang="ja">
        {idiom.headword}
      </p>
      <p className="reading-shown" lang="ja">
        {expected}
      </p>
      {tts.available && (
        <button type="button" className="tts-btn" onClick={() => tts.speak(expected)}>
          <span aria-hidden="true">🔊</span> 소리 듣기
        </button>
      )}
      {!correct && (
        <p className="wrong-answer">
          입력: <span lang="ja">{answer || '(빈칸)'}</span>
          {mistakeType && <span className="tag">{MISTAKE_LABEL[mistakeType]}</span>}
        </p>
      )}
      <div className="card-bottom">
        {correct ? (
          <div className="answer-row three">
            <button type="button" className="btn" onClick={() => onNext('hard')}>
              헷갈렸다
            </button>
            <button type="button" className="btn-primary" onClick={() => onNext()}>
              다음
            </button>
            <button type="button" className="btn" onClick={() => onNext('easy')}>
              쉬웠다
            </button>
          </div>
        ) : (
          <div className="answer-row">
            <button type="button" className="btn" onClick={() => setDetail(true)}>
              자세히
            </button>
            <button type="button" className="btn-primary wide" onClick={() => onNext()}>
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
