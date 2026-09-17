// 규칙 절의 본문·예시·대조를 그리는 조각 (2026-09-17).
// 규칙 화면과 오답 상세가 **같은 것**을 보여주도록 한 곳에 둔다. 화면 모듈과 갈라 둔 이유는
// 오답 상세가 이걸 쓰면서 사전 로더·IndexedDB 까지 끌고 오면 안 되기 때문이다.
import { splitJa } from './ja.ts'
import type { RuleSection } from './rules.ts'

/**
 * 한국어 문장 속 일본어에 `lang="ja"` 를 붙여 그린다.
 * 안 붙이면 한중일 통합 코드포인트가 한국 자형으로 나가서 틀린 글자 모양을 학습한다
 * (CLAUDE.md 「일본어 렌더링」). 규칙 본문은 한 문장에 두 언어가 섞여 문장 단위로는 못 붙인다.
 */
export function Mixed({ text }: { text: string }) {
  return (
    <>
      {splitJa(text).map((r, i) =>
        r.ja ? (
          <span lang="ja" key={i}>
            {r.text}
          </span>
        ) : (
          <span key={i}>{r.text}</span>
        ),
      )}
    </>
  )
}

/** 본문·예시·대조. 화면과 오답 상세가 같은 것을 보여주도록 여기 한 곳에서 그린다 */
export function RuleBody({ section, short = false }: { section: RuleSection; short?: boolean }) {
  const body = short ? section.body.slice(0, 2) : section.body
  const examples = short ? section.examples.slice(0, 3) : section.examples
  const contrasts = short ? section.contrasts.slice(0, 1) : section.contrasts
  return (
    <>
      {body.map((p, i) => (
        <p className="rule-para" key={i}>
          <Mixed text={p} />
        </p>
      ))}

      <ul className="rule-examples">
        {examples.map((ex) => (
          <li key={ex.word + ex.reading}>
            <span className="rule-word" lang="ja">
              {ex.word}
            </span>
            <span className="rule-reading" lang="ja">
              {ex.reading}
            </span>
            <span className="rule-note">
              <Mixed text={ex.note} />
            </span>
          </li>
        ))}
      </ul>

      {contrasts.map((c, i) => (
        <div className="rule-contrast" key={i}>
          <div className="rule-pair">
            <span className="rule-side applied">
              <span lang="ja">{c.applied.word}</span>
              <span className="rule-reading" lang="ja">
                {c.applied.reading}
              </span>
            </span>
            <span className="rule-vs" aria-hidden="true">
              ↔
            </span>
            <span className="rule-side blocked">
              <span lang="ja">{c.blocked.word}</span>
              <span className="rule-reading" lang="ja">
                {c.blocked.reading}
              </span>
            </span>
          </div>
          <p className="rule-because">
            <Mixed text={c.because} />
          </p>
        </div>
      ))}
    </>
  )
}
