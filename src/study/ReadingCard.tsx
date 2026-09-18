// 읽기 교정 카드 — 숙어 제시 → 히라가나 입력. 객관식이 아니다 (PLAN §6).
// 입력창은 피드백 중에도 마운트를 유지한다 — iOS 스탠드얼론에서 포커스·키보드를 놓지 않으려고.
import { useEffect, useState } from 'react'
import type { Confidence } from '../core/scheduler.ts'
import { diffAnswer } from '../core/answerDiff.ts'
import { toHiragana } from '../lib/readings.ts'
import { loadExamples } from '../dict/load.ts'
import type { RuntimeIdiom } from '../dict/load.ts'
import type { ReadingFeedback } from './useStudySession.ts'
import { KanaInput } from './KanaInput.tsx'
import { MistakeDetail } from './MistakeDetail.tsx'
import { mistakeHint, mistakeLabel, RULE_MISTAKES } from './mistakeLabels.ts'
import { Mixed } from '../app/RuleBody.tsx'
import { tts } from './tts.ts'

interface Props {
  idiom: RuntimeIdiom
  feedback?: ReadingFeedback
  /**
   * 「읽기 둘」 카드면 채워진다. `given` 은 여태 맞힌 읽기 —
   * 답 칸에 채워 보여줘 같은 답을 또 쓰지 않게 한다
   */
  dualAsk?: { total: number; given: string[] }
  onSubmit: (answer: string) => void
  /** 모르겠다고 넘기기 — 정답 화면으로 바로 간다 */
  onPass: () => void
  onNext: (confidence?: Confidence) => void
}

export function ReadingCard({
  idiom,
  feedback: fb,
  dualAsk,
  onSubmit,
  onPass,
  onNext,
}: Props) {
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
        <MistakeDetail
          idiom={idiom}
          mistakeType={fb.mistakeType}
          voicing={fb.voicing}
          onClose={() => setDetail(false)}
        />
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
          <>
            <span className="tag">읽기 · 밴드 {idiom.band}</span>
            {/* 「읽기 둘」 표시를 헤더 태그로 옮겼다 (2026-09-14). 본문에 같은 정보를
                문장으로 또 적으면 카드가 넘쳐 내부 스크롤이 생기고, 그 스크롤이
                눈에 잘 안 띈다는 지적(사용자) — 문장 대신 태그 한 줄로 줄인다 */}
            {dualAsk && (
              <span className="tag muted band-tag">
                읽기 둘 · {dualAsk.given.length + 1}/{dualAsk.total}
              </span>
            )}
          </>
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
            {/* 내가 쓴 답을 정답과 자리별로 대조해 틀린 글자만 색으로 표시한다.
                입력창(locked)엔 그대로 남아 있지만 native input 안이라 글자별로 못 칠한다.
                채점(isCorrectReading)과 같은 정규화(toHiragana)를 거쳐야 표기 차이가
                거짓 오답처럼 보이지 않는다 */}
            {!fb.correct && fb.answer.trim() !== '' && (
              <p className="answer-diff">
                <span className="answer-diff-label">내가 쓴 답</span>
                <span className="answer-diff-text" lang="ja">
                  {diffAnswer(toHiragana(fb.expected.trim()), toHiragana(fb.answer.trim())).map(
                    (d, i) => (
                      <span key={i} className={d.match ? undefined : 'diff-wrong'}>
                        {d.char}
                      </span>
                    ),
                  )}
                </span>
              </p>
            )}
            {/* 동형이독의 다른 읽기로 맞힌 경우 (2026-09-14). 정답으로 치되 이 카드가
                묻는 읽기를 알려준다 — 위 루비가 내가 안 쓴 글자라 이 줄이 없으면
                「정답인데 왜 다른 글자가 뜨지」 가 된다 */}
            {/* 「읽기 둘」 결과. 맞힌 쪽만 기록에 남고 못 쓴 쪽은 아직 안 배운 카드로
                남는다 — 맞는 읽기를 쓰고 정답률이 깎이면 안 된다 */}
            {fb.dual && (
              <p className="rule-hint">
                {fb.dual.got.length === 2 ? (
                  <>두 읽기를 다 맞혔어요. 각각 따로 익히게 됩니다.</>
                ) : fb.dual.got.length === 1 ? (
                  <>
                    <span lang="ja">{fb.dual.got[0].reading}</span> 는 맞혔어요. 나머지 하나는
                    아직 안 배운 것으로 두고 다음에 다시 냅니다.
                  </>
                ) : (
                  <>이 표기는 읽기가 둘이에요. 둘 다 다음에 다시 냅니다.</>
                )}
              </p>
            )}
            {fb.viaAlt && (
              <p className="rule-hint">
                <span lang="ja">{fb.answer}</span> 도 맞는 읽기예요. 이 카드가 묻는 건{' '}
                <span lang="ja">{fb.expected}</span> 입니다.
              </p>
            )}
            {/* 입력값은 아래 입력창(locked)에 그대로 남아 있어 여기선 유형과 규칙만 (Phase 9-C 이후) */}
            {/* 이름은 갈래까지 정확하게 (2026-09-17). 분류기가 연탁·반탁·연성을 한 유형으로
                묶어도 사용자가 보는 이름은 방금 틀린 그 현상이어야 한다 */}
            {!fb.correct && fb.mistakeType && (
              <p className="wrong-answer">
                <span className="tag">{mistakeLabel(fb.mistakeType, fb.voicing)}</span>
              </p>
            )}
            {/* 규칙형 오답이면 규칙 한 줄을 여기서 바로 보여준다 (2026-09-13).
                전에는 「자세히」 안에만 있어서, 틀리고 + 누르고 + 규칙형이어야 닿았다.
                어휘형(음독 선택·한국음 간섭)에는 안 붙인다 — 규칙이 없는 자리에 글을
                늘리면 있는 해설까지 안 읽힌다 (context-notes 2026-09-07) */}
            {!fb.correct && fb.mistakeType && RULE_MISTAKES.has(fb.mistakeType) && (
              <p className="rule-hint">
                {/* 해설 문장에 섞인 일본어에도 lang="ja" 를 붙인다 (2026-09-17) — 안 붙이면
                    三日月·発達 이 한국 자형으로 나가서 틀린 글자 모양을 학습한다 */}
                <Mixed text={mistakeHint(fb.mistakeType, fb.voicing)} />
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
          <>
            <p className="headword" lang="ja">
              {idiom.headword}
            </p>
            {/* 「읽기 둘」 카드 (2026-09-14). 처음부터 둘 다 묻는다 — 답을 보고 발동하면
                같은 실력이 순서에 따라 다르게 처리된다.
                답 칸 두 개로 보여준다 (2026-09-15). 문장으로 쓰면 이미 쓴 읽기를 가리키는
                말이 필요한데, 「그것 말고 — <읽기>」 는 「A 말고 B」 어순 때문에 **그 읽기를
                쓰라는 뜻으로 뒤집혀 읽혔다.** 칸은 지시어가 없어 뒤집히지 않고, 맞혔다는
                확인(✓)과 아직 안 쓴 칸을 한 줄이 같이 말한다 — 첫 질문에도 뜬다 */}
            {dualAsk && (
              <p className="dual-slots">
                {dualAsk.given.map((r) => (
                  <span className="dual-slot done" key={r}>
                    <span lang="ja">{r}</span>
                    <span aria-hidden="true"> ✓</span>
                  </span>
                ))}
                {Array.from({ length: dualAsk.total - dualAsk.given.length }, (_, i) => (
                  <span className="dual-slot" key={i}>
                    ?
                  </span>
                ))}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card-bottom">
        {/* 카드가 바뀌어도 리마운트하지 않는다 — 포커스·키보드 유지. 피드백 중엔 locked(제출만 무시) */}
        {/* resetKey 에 이어 묻기 여부를 넣어 방금 친 답을 비운다 — 컴포넌트는 그대로라
            포커스와 키보드는 유지된다 */}
        <KanaInput
          onSubmit={onSubmit}
          resetKey={idiom.idiomId + ':' + (dualAsk?.given.length ?? 0)}
          locked={!!fb}
        />
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
