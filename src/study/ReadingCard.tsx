// 읽기 교정 카드 — 숙어 제시 → 히라가나 입력. 객관식이 아니다 (PLAN §6).
// 입력창은 피드백 중에도 마운트를 유지한다 — iOS 스탠드얼론에서 포커스·키보드를 놓지 않으려고.
import { useEffect, useState } from 'react'
import type { Confidence } from '../core/scheduler.ts'
import { loadExamples } from '../dict/load.ts'
import type { RuntimeIdiom } from '../dict/load.ts'
import type { ReadingFeedback } from './useStudySession.ts'
import { KanaInput } from './KanaInput.tsx'
import { MistakeDetail } from './MistakeDetail.tsx'
import { MISTAKE_ADVICE, MISTAKE_LABEL, RULE_MISTAKES } from './mistakeLabels.ts'
import { tts } from './tts.ts'

interface Props {
  idiom: RuntimeIdiom
  feedback?: ReadingFeedback
  onSubmit: (answer: string) => void
  /** 모르겠다고 넘기기 — 정답 화면으로 바로 간다 */
  onPass: () => void
  onNext: (confidence?: Confidence) => void
}

export function ReadingCard({ idiom, feedback: fb, onSubmit, onPass, onNext }: Props) {
  const [detail, setDetail] = useState(false)

  // 다음 카드로 넘어갈 때 오답 상세 뷰를 닫는다 (effect 로 setState 하지 않으려고 핸들러에서)
  const next = (c?: Confidence) => {
    setDetail(false)
    onNext(c)
  }

  // 오답 상세는 카드를 교체하지 않고 그 위에 덮는다 (.card 기준 absolute).
  // 카드를 언마운트하면 KanaInput 이 리마운트되며 방금 낸 답이 사라진다 — 그대로 둔다.
  return (
    <div className={`card${fb ? ` feedback ${fb.correct ? 'is-ok' : 'is-ng'}` : ''}`}>
      {detail && fb && (
        <MistakeDetail idiom={idiom} mistakeType={fb.mistakeType} onClose={() => setDetail(false)} />
      )}
      <div className="card-head">
        {fb ? (
          <>
            <span className="verdict">
              <span aria-hidden="true">{fb.correct ? '✓' : '✗'}</span>
              {fb.correct ? '정답' : '오답'}
            </span>
            <span className="tag muted band-tag">밴드 {idiom.band}</span>
          </>
        ) : (
          <span className="tag">읽기 · 밴드 {idiom.band}</span>
        )}
      </div>

      <div className="card-body">
        {fb ? (
          <>
            <p className="headword has-ruby answer-ruby" lang="ja">
              {fb.ruby.map((r, i) => (
                <ruby key={i}>
                  {r.text}
                  <rt>{r.rt}</rt>
                </ruby>
              ))}
            </p>
            {/* 동형이독의 다른 읽기로 맞힌 경우 (2026-09-14). 정답으로 치되 이 카드가
                묻는 읽기를 알려준다 — 위 루비가 내가 안 쓴 글자라 이 줄이 없으면
                「정답인데 왜 다른 글자가 뜨지」 가 된다 */}
            {fb.viaAlt && (
              <p className="rule-hint">
                <span lang="ja">{fb.answer}</span> 도 맞는 읽기예요. 이 카드가 묻는 건{' '}
                <span lang="ja">{fb.expected}</span> 입니다.
              </p>
            )}
            {/* 입력값은 아래 입력창(locked)에 그대로 남아 있어 여기선 유형과 규칙만 (Phase 9-C 이후) */}
            {!fb.correct && fb.mistakeType && (
              <p className="wrong-answer">
                <span className="tag">{MISTAKE_LABEL[fb.mistakeType]}</span>
              </p>
            )}
            {/* 규칙형 오답이면 규칙 한 줄을 여기서 바로 보여준다 (2026-09-13).
                전에는 「자세히」 안에만 있어서, 틀리고 + 누르고 + 규칙형이어야 닿았다.
                어휘형(음독 선택·한국음 간섭)에는 안 붙인다 — 규칙이 없는 자리에 글을
                늘리면 있는 해설까지 안 읽힌다 (context-notes 2026-09-07) */}
            {!fb.correct && fb.mistakeType && RULE_MISTAKES.has(fb.mistakeType) && (
              <p className="rule-hint">{MISTAKE_ADVICE[fb.mistakeType]}</p>
            )}
            {tts.available && (
              <button type="button" className="tts-btn" onClick={() => tts.speak(fb.expected)}>
                <span aria-hidden="true">🔊</span> 소리 듣기
              </button>
            )}
            <ExampleSentence key={idiom.idiomId} idiomId={idiom.idiomId} />
            {fb.correct && fb.echo.length > 0 && (
              <p className="echo">
                {fb.echo.map((e) => (
                  <span className="echo-item" key={e.kanji + e.base}>
                    <span lang="ja">
                      {e.kanji} {e.base}
                    </span>
                    <span className="echo-nth">{e.nth}번째</span>
                  </span>
                ))}
              </p>
            )}
            {fb.observe && (
              <p className="observe">
                <span lang="ja">
                  {fb.observe.kanji} {fb.observe.base}
                </span>
                , 지난번엔 틀렸는데 이번엔 맞혔어요
              </p>
            )}
          </>
        ) : (
          <p className="headword" lang="ja">
            {idiom.headword}
          </p>
        )}
      </div>

      <div className="card-bottom">
        {/* 카드가 바뀌어도 리마운트하지 않는다 — 포커스·키보드 유지. 피드백 중엔 locked(제출만 무시) */}
        <KanaInput onSubmit={onSubmit} resetKey={idiom.idiomId} locked={!!fb} />
        {/* 모를 때 넘기는 길 (2026-09-14). 없으면 아무 글자나 쳐서 오답을 만들어야 했고,
            그 입력이 오답 유형 분포까지 오염시켰다. 자리는 피드백 뒤의 버튼 줄과 같다 */}
        {!fb && (
          <div className="answer-row">
            <span className="slot" aria-hidden="true" />
            <button type="button" className="btn" onClick={onPass}>
              모르겠어요
            </button>
            <span className="slot" aria-hidden="true" />
          </div>
        )}
        {fb &&
          (fb.correct ? (
            <div className="answer-row">
              <button type="button" className="btn" onClick={() => next('hard')}>
                헷갈렸다
              </button>
              <button type="button" className="btn-primary" onClick={() => next()}>
                다음
              </button>
              <button type="button" className="btn" onClick={() => next('easy')}>
                쉬웠다
              </button>
            </div>
          ) : (
            <div className="answer-row">
              <button type="button" className="btn" onClick={() => setDetail(true)}>
                자세히
              </button>
              <button type="button" className="btn-primary" onClick={() => next()}>
                다음
              </button>
              <span className="slot" aria-hidden="true" />
            </div>
          ))}
      </div>
    </div>
  )
}

/**
 * Tatoeba 무번역 예문 1개 — 확인 단계 참고용, 번역 없음 (Phase 6, context-notes 2026-09-04 절).
 * 세션 시작을 막지 않으려고 첫 렌더에서만 fetch 한다. 없으면 아무것도 안 보여준다.
 * 부모가 `key={idiomId}` 로 카드마다 새로 마운트한다 — 이전 예문이 잠깐이라도 안 남는다.
 */
function ExampleSentence({ idiomId }: { idiomId: string }) {
  const [sentence, setSentence] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadExamples().then((m) => {
      if (alive) setSentence(m.get(idiomId)?.[0] ?? null)
    })
    return () => {
      alive = false
    }
  }, [idiomId])

  if (sentence === null) return null
  return (
    <p className="example-sentence" lang="ja">
      {sentence}
    </p>
  )
}
