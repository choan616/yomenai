// 세션 중간 환기 퀴즈 화면 — 읽기가 같거나 비슷한 다른 표기 고르기. 점수·기록 없이 한 탭으로 건너뛴다 (PLAN §11 S4)
import { useEffect, useState, type CSSProperties } from 'react'
import { appendStar } from '../app/star.ts'
import type { QuizQuestion } from '../core/quiz.ts'
import { replay } from '../core/replay.ts'
import type { LearningEvent } from '../core/types.ts'
import { QUIZ_STAR_LIST, markQuizStarHintSeen, quizStarHintSeen } from './quizSession.ts'
import { useEnterForNext } from './useEnterForNext.ts'

interface Props {
  /** 한 덩어리의 문항들(보통 2개). 번호는 화면에 안 보인다 — 숫자가 늘면 길게 느껴진다 */
  questions: QuizQuestion[]
  /** 다 풀었을 때와 건너뛸 때 모두 이 하나다. 결과는 어디에도 안 남는다 */
  onFinish: () => void
  /** 이미 담긴 표현을 ★ 로 시작하려고 세션이 읽은 기록 */
  events: { prior: LearningEvent[]; session: LearningEvent[] }
}

export function QuizCard({ questions, onFinish, events }: Props) {
  const [qi, setQi] = useState(0)
  /** 고른 보기의 idiomId. 고르면 그 자리에서 정답이 드러난다 */
  const [picked, setPicked] = useState<string | null>(null)
  /** 뜻을 탭해서 연 문항. 읽기만으로 먼저 떠올려 보게 처음엔 가린다 */
  const [revealed, setRevealed] = useState(false)
  /** 단어장에 담긴 표현. 고른 뒤 보기를 누르면 담고 뺀다 — 퀴즈 풀이는 안 남겨도 이 표시는 사용자의 뜻이라 남긴다 */
  const [starred, setStarred] = useState<ReadonlySet<string>>(
    () => replay([...events.prior, ...events.session]).starred,
  )
  /** 안내는 첫 퀴즈 동안만 — 마운트 때 정한다(두 문항에 걸쳐 같은 자리) */
  const [showHint] = useState(() => !quizStarHintSeen())
  const q = questions[qi]!
  const last = qi === questions.length - 1
  const answered = picked !== null
  // 읽기 고르기의 보기는 읽기만 보여 줘서 눌러 담을 수 없다 — 담기와 안내는 표기 고르기에만 있다
  const canStar = q.kind === 'headword'
  const options =
    q.kind === 'reading'
      ? q.options.map((o) => ({ idiomId: o.idiomId, text: o.reading }))
      : q.options.map((o) => ({ idiomId: o.idiomId, text: o.headword }))
  const maxLen = Math.max(...options.map((o) => [...o.text].length))
  useEffect(() => {
    if (showHint && canStar && answered) markQuizStarHintSeen()
  }, [showHint, canStar, answered])

  const toggleStar = (id: string) => {
    const on = !starred.has(id)
    setStarred((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
    void appendStar(id, on, QUIZ_STAR_LIST)
  }

  const next = () => {
    if (last) {
      onFinish()
      return
    }
    setQi(qi + 1)
    setPicked(null)
    setRevealed(false)
  }
  // 정답·오답 화면의 Enter 와 같은 관례 — 고르기 전에는 꺼 둔다
  useEnterForNext(answered, next)

  return (
    <div className="card quiz-card">
      <div className="card-head">
        {/* 문항 종류(동음·근접)를 가리지 않는 한 문구다 — 머리가 문항마다 바뀌지 않게 */}
        <span className="tag">잠깐, 헷갈리는 소리</span>
        <button type="button" className="skip-btn" onClick={onFinish}>
          건너뛰기
        </button>
      </div>

      <div className="card-body">
        <p className="prompt-q">{q.kind === 'reading' ? '어떻게 읽을까요?' : '어느 표기일까요?'}</p>
        <p className="headword sm" lang="ja">
          {q.kind === 'reading' ? q.headword : q.reading}
        </p>
        {q.kind === 'headword' && (
          /* 뜻 줄은 가려도 자리를 지킨다 — 탭해서 나타나며 보기를 밀지 않게. 고르면 저절로 드러난다 */
          <div className="quiz-meaning">
            <p className={`meaning${revealed || answered ? '' : ' is-hidden'}`}>{q.meaning}</p>
            {!revealed && !answered && (
              <button type="button" className="meaning-reveal" onClick={() => setRevealed(true)}>
                뜻 보기
              </button>
            )}
          </div>
        )}
        <div
          className={`quiz-opts${q.kind === 'reading' ? ' is-reading' : ''}`}
          style={q.kind === 'reading' ? ({ '--n': maxLen } as CSSProperties) : undefined}
          role="group"
          aria-label="보기"
        >
          {options.map((o) => {
            const isAnswer = o.idiomId === q.targetId
            const state = !answered ? '' : isAnswer ? ' is-ok' : o.idiomId === picked ? ' is-ng' : ''
            return (
              <button
                key={o.idiomId}
                type="button"
                className={`btn quiz-opt${state}`}
                aria-pressed={answered && canStar ? starred.has(o.idiomId) : undefined}
                onClick={() => {
                  if (!answered) setPicked(o.idiomId)
                  else if (canStar) toggleStar(o.idiomId)
                }}
              >
                {answered &&
                  canStar &&
                  (starred.has(o.idiomId) ? (
                    <span className="quiz-opt-star" role="img" aria-label="담았어요">
                      ★
                    </span>
                  ) : (
                    // 담을 수 있다는 단서 — 상태는 버튼의 aria-pressed 가 말하므로 읽지 않는다
                    <span className="quiz-opt-star-off" aria-hidden="true">
                      ☆
                    </span>
                  ))}
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
                  <span lang="ja">{o.text}</span>
                </span>
              </button>
            )
          })}
        </div>
        {/* 자리는 고르기 전에도 지킨다 — 나타나며 보기를 밀지 않게 */}
        {showHint && canStar && (
          <p className={`quiz-hint${answered ? '' : ' is-hidden'}`} aria-hidden={answered ? undefined : true}>
            모르는 표현은 눌러서 담아요
          </p>
        )}
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
