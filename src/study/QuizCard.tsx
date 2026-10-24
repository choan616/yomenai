// 세션 중간 환기 퀴즈 화면 — 같은 읽기의 다른 표기 고르기. 점수·기록 없이 한 탭으로 건너뛴다 (PLAN §11 S4)
import { useState } from 'react'
import type { HomophoneQuestion } from '../core/quiz.ts'
import { useEnterForNext } from './useEnterForNext.ts'

interface Props {
  /** 한 덩어리의 문항들(보통 2개). 번호는 화면에 안 보인다 — 숫자가 늘면 길게 느껴진다 */
  questions: HomophoneQuestion[]
  /** 다 풀었을 때와 건너뛸 때 모두 이 하나다. 결과는 어디에도 안 남는다 */
  onFinish: () => void
}

export function QuizCard({ questions, onFinish }: Props) {
  const [qi, setQi] = useState(0)
  /** 고른 보기의 idiomId. 고르면 그 자리에서 정답과 각 보기의 뜻이 드러난다 */
  const [picked, setPicked] = useState<string | null>(null)
  const q = questions[qi]!
  const last = qi === questions.length - 1
  const answered = picked !== null

  const next = () => {
    if (last) {
      onFinish()
      return
    }
    setQi(qi + 1)
    setPicked(null)
  }
  // 정답·오답 화면의 Enter 와 같은 관례 — 고르기 전에는 꺼 둔다
  useEnterForNext(answered, next)

  return (
    <div className="card quiz-card">
      <div className="card-head">
        <span className="tag">잠깐, 같은 소리 다른 글자</span>
        <button type="button" className="skip-btn" onClick={onFinish}>
          건너뛰기
        </button>
      </div>

      <div className="card-body">
        <p className="prompt-q">어느 표기일까요?</p>
        <p className="headword sm" lang="ja">
          {q.reading}
        </p>
        <p className="meaning">{q.meaning}</p>
        <div className="quiz-opts" role="group" aria-label="보기">
          {q.options.map((o) => {
            const isAnswer = o.idiomId === q.targetId
            const state = !answered ? '' : isAnswer ? ' is-ok' : o.idiomId === picked ? ' is-ng' : ''
            return (
              <button
                key={o.idiomId}
                type="button"
                className={`btn quiz-opt${state}`}
                onClick={() => {
                  if (!answered) setPicked(o.idiomId)
                }}
              >
                <span className="quiz-opt-word">
                  {state === ' is-ok' && (
                    <span className="quiz-opt-mark" role="img" aria-label="정답">
                      ✓
                    </span>
                  )}
                  {state === ' is-ng' && (
                    <span className="quiz-opt-mark" role="img" aria-label="내가 고른 오답">
                      ✗
                    </span>
                  )}
                  <span lang="ja">{o.headword}</span>
                </span>
                {answered && <span className="quiz-opt-mean">{o.meaning}</span>}
              </button>
            )
          })}
        </div>
      </div>

      <div className="card-bottom">
        <div className="answer-row">
          <span className="slot" aria-hidden="true" />
          {/* 고르기 전에도 자리는 지킨다 — 보기를 누르고 나서 「다음」이 나타나는 자리가 움직이지 않게 */}
          <button
            type="button"
            className={`btn-primary${answered ? '' : ' slot'}`}
            tabIndex={answered ? 0 : -1}
            aria-hidden={answered ? undefined : true}
            onClick={next}
          >
            {last ? '계속' : '다음'}
          </button>
          <span className="slot" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
