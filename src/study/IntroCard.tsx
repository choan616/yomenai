// 소개 카드 — 처음 만나는 숙어를 시험 대신 보여준다 (2026-09-13).
// 채점도 이벤트도 없다. 다음 만남부터 문제로 나온다.
import { useEffect, useState } from 'react'
import type { RubySegment } from '../core/ruby.ts'
import { loadExamples, type RuntimeIdiom } from '../dict/load.ts'
import { tts } from './tts.ts'

export function IntroCard({
  idiom,
  ruby,
  onSeen,
}: {
  idiom: RuntimeIdiom
  /** 없으면 한자와 읽기를 따로 보여준다 — 분해 실패해도 카드는 떠야 한다 */
  ruby?: RubySegment[]
  onSeen: () => void
}) {
  const [sentence, setSentence] = useState<string | null>(null)

  // 예문은 있으면 한 줄만. 없다고 소개를 미루지 않는다
  useEffect(() => {
    let alive = true
    void loadExamples().then((m) => {
      if (alive) setSentence(m.get(idiom.idiomId)?.[0] ?? null)
    })
    return () => {
      alive = false
    }
  }, [idiom.idiomId])

  return (
    <div className="card intro-card">
      <div className="card-head">
        {/* "처음 만나요" 는 앱이 모르는 걸 단정하는 말이었다 — 기록에 없을 뿐이다 */}
        <span className="tag">알아 두기</span>
      </div>
      <div className="card-body">
        {/* 한자 위에 읽기를 얹는다 (2026-09-14) — 어느 글자가 어떻게 읽히는지가 바로 보인다.
            줄을 따로 두면 눈이 두 번 움직이고 대응도 직접 맞춰야 한다 */}
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
        {idiom.koMeaning?.definition && <p className="meaning">{idiom.koMeaning.definition}</p>}
        {tts.available && (
          <button type="button" className="tts-btn" onClick={() => tts.speak(idiom.reading)}>
            <span aria-hidden="true">🔊</span> 소리 듣기
          </button>
        )}
        {sentence !== null && (
          <p className="browse-ex" lang="ja">
            {sentence}
          </p>
        )}
      </div>
      <div className="card-bottom">
        <div className="answer-row">
          <span className="slot" aria-hidden="true" />
          <button type="button" className="btn-primary" onClick={onSeen}>
            봤어요
          </button>
          <span className="slot" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
