// 어휘 확장 카드 — 뜻 + 읽기 확인. 동형이의·일본 고유 그룹에서만 나온다 (PLAN §6)
import { useState } from 'react'
import type { RuntimeIdiom } from '../dict/load.ts'

interface Props {
  idiom: RuntimeIdiom
  /** 자기 채점을 마쳤는지 (오답이면 뜻을 다시 보여준다) */
  graded: boolean
  onGrade: (known: boolean) => void
  onNext: () => void
}

export function MeaningCard({ idiom, graded, onGrade, onNext }: Props) {
  const [revealed, setRevealed] = useState(false)
  const meaning = idiom.koMeaning?.definition?.trim() || idiom.koMeaning?.word?.trim()

  return (
    <div className={`card ${graded ? 'feedback is-ng' : ''}`}>
      <div className="card-head">
        <span className="tag">뜻 · 밴드 {idiom.band}</span>
        {idiom.koMeaning && !idiom.koMeaning.verified && (
          <span className="tag muted">미검수</span>
        )}
      </div>
      <p className="headword" lang="ja">
        {idiom.headword}
      </p>
      <p className="reading-shown" lang="ja">
        {idiom.reading}
      </p>

      {revealed || graded ? (
        <p className="meaning">{meaning || '뜻 미등록'}</p>
      ) : (
        <p className="meaning placeholder">뜻을 떠올려 보세요</p>
      )}

      <div className="card-bottom">
        {graded ? (
          <div className="answer-row">
            <button type="button" className="btn-primary wide" onClick={onNext}>
              다음
            </button>
          </div>
        ) : !revealed ? (
          <div className="answer-row">
            <button type="button" className="btn-primary wide" onClick={() => setRevealed(true)}>
              뜻 보기
            </button>
          </div>
        ) : (
          <div className="answer-row">
            <button type="button" className="btn" onClick={() => onGrade(false)}>
              몰랐어요
            </button>
            <button type="button" className="btn-primary" onClick={() => onGrade(true)}>
              알았어요
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
