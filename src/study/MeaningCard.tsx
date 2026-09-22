// 어휘 확장 카드 — 뜻 + 읽기 확인. 동형이의·일본 고유 그룹에서만 나온다 (PLAN §6)
import { useState } from 'react'
import type { RubySegment } from '../core/ruby.ts'
import type { MeaningVerdict } from '../core/types.ts'
import type { RuntimeIdiom } from '../dict/load.ts'
import { tts } from './tts.ts'

interface Props {
  idiom: RuntimeIdiom
  /** 한자 위에 얹을 읽기. 없으면 한자와 읽기를 따로 보여준다 */
  ruby?: RubySegment[]
  /** 자기 채점을 마쳤는지 (오답이면 뜻을 다시 보여준다) */
  graded: boolean
  onGrade: (known: boolean) => void
  onNext: () => void
  /** 이 뜻에 누른 엄지. 안 눌렀으면 null */
  vote: MeaningVerdict | null
  /** 엄지 — 누른 쪽을 다시 누르면 취소. 카드는 안 넘어간다 */
  onVote: (verdict: MeaningVerdict) => void
}

export function MeaningCard({ idiom, ruby, graded, onGrade, onNext, vote, onVote }: Props) {
  const [revealed, setRevealed] = useState(false)
  const meaning = idiom.koMeaning?.definition?.trim()

  return (
    <div className={`card ${graded ? 'feedback is-ng' : ''}`}>
      <div className="card-head">
        <span className="tag">뜻 · 밴드 {idiom.band}</span>
        {/* 「미검수」는 사전 빌드의 `verified` 다. 엄지 위를 누른 뒤에는 **내가 봤으니**
            떼어 준다 — 다음 빌드에서 진짜 verified 가 될 때까지의 임시 표시다 */}
        {idiom.koMeaning && !idiom.koMeaning.verified && vote !== 'ok' && (
          <span className="tag muted">미검수</span>
        )}
      </div>
      <div className="card-body">
        {/* 읽기는 묻지 않는 카드라 한자 위에 얹는다 (2026-09-14) — 글자와 소리의 대응이
            한눈에 들어와야 뜻을 떠올리는 데 방해가 없다 */}
        {ruby === undefined ? (
          <>
            <p className="headword" lang="ja">
              {idiom.headword}
            </p>
            <p className="reading-shown" lang="ja">
              {idiom.reading}
            </p>
          </>
        ) : (
          <p className="headword has-ruby" lang="ja">
            {ruby.map((r, i) => (
              <ruby key={i}>
                {r.text}
                <rt>{r.rt}</rt>
              </ruby>
            ))}
          </p>
        )}
        {/* 확인 단계(뜻 확인 후)에만 소리를 보탠다 — 문제 풀이(뜻 떠올리기) 중엔 안 준다 */}
        {(revealed || graded) && tts.available && (
          <button type="button" className="tts-btn" onClick={() => tts.speak(idiom.reading)}>
            <span aria-hidden="true">🔊</span> 소리 듣기
          </button>
        )}

        {revealed || graded ? (
          <p className="meaning">{meaning || '뜻 미등록'}</p>
        ) : (
          <p className="meaning placeholder">뜻을 떠올려 볼까요?</p>
        )}

        {/* 뜻 평가 (2026-09-22). **뜻이 드러난 뒤에만** — 가려진 것을 판단할 수 없다.
            글자 버튼("이 뜻 이상해요")은 눈에 안 들어온다는 지적에 엄지 둘로 바꿨다.
            누르고 나서 하던 대로 답하면 된다: 카드를 넘기지 않는다.
            검수가 끝나도 안 없앤다 — 쓰는 동안 계속 열려 있는 창구다 (사용자 판단) */}
        {(revealed || graded) && meaning && (
          <div className="vote-row" role="group" aria-label="이 뜻 평가">
            <button
              type="button"
              className={`vote-btn ok${vote === 'ok' ? ' on' : ''}`}
              aria-pressed={vote === 'ok'}
              aria-label="뜻이 맞아요"
              onClick={() => onVote('ok')}
            >
              <span aria-hidden="true">👍</span>
            </button>
            <button
              type="button"
              className={`vote-btn bad${vote === 'bad' ? ' on' : ''}`}
              aria-pressed={vote === 'bad'}
              aria-label="뜻이 이상해요"
              onClick={() => onVote('bad')}
            >
              <span aria-hidden="true">👎</span>
            </button>
          </div>
        )}
      </div>

      <div className="card-bottom">
        {graded ? (
          <div className="answer-row">
            <span className="slot" aria-hidden="true" />
            <button type="button" className="btn-primary" onClick={onNext}>
              다음
            </button>
            <span className="slot" aria-hidden="true" />
          </div>
        ) : !revealed ? (
          <div className="answer-row">
            <span className="slot" aria-hidden="true" />
            <button type="button" className="btn-primary" onClick={() => setRevealed(true)}>
              뜻 보기
            </button>
            <span className="slot" aria-hidden="true" />
          </div>
        ) : (
          <div className="answer-row choice">
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
