// 읽기 교정 카드 — 숙어 제시 → 히라가나 입력. 객관식이 아니다 (PLAN §6).
// 입력창은 피드백 중에도 마운트를 유지한다 — iOS 스탠드얼론에서 포커스·키보드를 놓지 않으려고.
import { useEffect, useState } from 'react'
import type { Confidence } from '../core/scheduler.ts'
import { loadExamples } from '../dict/load.ts'
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

export function ReadingCard({ idiom, feedback: fb, onSubmit, onNext }: Props) {
  const [detail, setDetail] = useState(false)

  // 다음 카드로 넘어갈 때 오답 상세 뷰를 닫는다 (effect 로 setState 하지 않으려고 핸들러에서)
  const next = (c?: Confidence) => {
    setDetail(false)
    onNext(c)
  }

  if (detail && fb) {
    return <MistakeDetail idiom={idiom} onClose={() => setDetail(false)} />
  }

  return (
    <div className={`card${fb ? ` feedback ${fb.correct ? 'is-ok' : 'is-ng'}` : ''}`}>
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
            <p className="headword has-ruby" lang="ja">
              {fb.ruby.map((r, i) => (
                <ruby key={i}>
                  {r.text}
                  <rt>{r.rt}</rt>
                </ruby>
              ))}
            </p>
            {/* 입력값은 아래 입력창(locked)에 그대로 남아 있어 여기선 오답 유형만 (Phase 9-C 이후) */}
            {!fb.correct && fb.mistakeType && (
              <p className="wrong-answer">
                <span className="tag">{MISTAKE_LABEL[fb.mistakeType]}</span>
              </p>
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
