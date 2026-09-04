// 지연 검수 질문 — 미확정 분류 숙어가 카드 풀에 처음 들어올 때 뜻을 알았는지 묻는다 (Phase 3/4)
import type { RuntimeIdiom } from '../dict/load.ts'

interface Props {
  idiom: RuntimeIdiom
  onAnswer: (known: boolean) => void
}

export function ClassReviewPrompt({ idiom, onAnswer }: Props) {
  return (
    <div className="card">
      <div className="card-head">
        <span className="tag">확인</span>
      </div>
      <p className="prompt-q">이 숙어의 뜻을 이미 알고 계셨나요?</p>
      <p className="headword" lang="ja">
        {idiom.headword}
      </p>
      <div className="card-bottom">
        <div className="answer-row">
          <button type="button" className="btn" onClick={() => onAnswer(false)}>
            몰랐다
          </button>
          <button type="button" className="btn-primary" onClick={() => onAnswer(true)}>
            알고 있었다
          </button>
        </div>
      </div>
    </div>
  )
}
