// 로마자를 히라가나로 변환하는 읽기 입력 필드. wanakana 를 요소에 bind 한다 (PLAN §3).
// iOS 스탠드얼론 대응 — 카드마다 리마운트하지 않고(포커스 유지) resetKey 로 값만 비운다.
// lang="ja" 를 빼고 ASCII 전용 inputMode 로 일본어 IME 한자 변환을 억제한다 (아래 주석 참조).
import { useEffect, useRef } from 'react'
import { bind, unbind } from 'wanakana'
import type { DiffChar } from '../core/answerDiff.ts'

interface Props {
  onSubmit: (value: string) => void
  /** 카드가 바뀔 때마다 값을 비우는 트리거. 컴포넌트는 그대로 두고(포커스 유지) 값만 리셋 */
  resetKey: string | number
  /**
   * 피드백 중 제출을 막는다. HTML readonly/disabled 를 쓰지 않는다 — iOS 에서 포커스된
   * 입력에 readonly 를 걸면 blur 되며 키보드가 내려가고, 다음 카드에서 제스처 밖 focus()
   * 로는 다시 못 올린다. 입력은 계속 편집 가능한 채로 두고 submit 만 무시한다.
   */
  locked?: boolean
  /**
   * 오답이면 채워진다 (2026-09-18). input 자체는 글자별로 색을 못 칠해서, 입력값과
   * 똑같은 텍스트를 이 색으로 위에 덮어 그린다 — "입력창 안의 글자색이 바뀐" 것처럼 보인다.
   * 원래 글자는 투명(`has-diff`)으로 숨긴다.
   */
  diff?: DiffChar[]
}

export function KanaInput({ onSubmit, resetKey, locked, diff }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  /**
   * 빈/공백뿐인 값은 제출하지 않는다. 다음 문제로 넘어가면 입력창이 auto-focus 되는데,
   * "입력→Enter" 리듬으로 빠르게 치는 사용자가 새 문제를 읽기 전에 Enter 를 눌러
   * 빈 답이 오답으로 채점되던 버그를 막는다 (진단·세션 공통, context-notes 2026-09-06).
   */
  const submit = () => {
    if (locked) return
    const value = ref.current?.value ?? ''
    if (value.trim() === '') return
    onSubmit(value)
  }

  // 마운트 1회 — wanakana bind + 첫 포커스 (iOS 스탠드얼론에선 제스처 밖이라 무시될 수 있다)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    bind(el, { IMEMode: 'toHiragana' })
    el.focus()
    return () => {
      try {
        unbind(el)
      } catch {
        // 이미 unbind 된 경우 (StrictMode 이중 마운트)
      }
    }
  }, [])

  // 카드가 바뀌면 값만 비운다 (리마운트 아님 → 포커스 유지). locked 변화로는 안 비운다 —
  // 피드백이 뜰 때 방금 친 답을 지우면 안 되니까
  useEffect(() => {
    const el = ref.current
    if (el) el.value = ''
  }, [resetKey])

  // 카드가 바뀌면 포커스를 다시 잡는다 (데스크톱용, iOS 는 이미 유지 — locked 여도 blur 안 됨)
  useEffect(() => {
    ref.current?.focus()
  }, [resetKey])

  return (
    <div className="answer-row input">
      <div className="kana-input-shell">
        <input
          ref={ref}
          className={`kana-input${locked ? ' locked' : ''}${diff ? ' has-diff' : ''}`}
          type="text"
          /* 일본어 IME(한자 변환 후보 바)를 막는다. iOS 는 변환 바를 숨기는 API 가 없어서
             ASCII 전용 키보드를 띄우는 inputMode 를 쓴다(언어 키보드가 아니라 후보 바 없음).
             wanakana 가 로마자→가나 변환은 그대로 한다.

             "email" 이었는데 "url" 로 바꿨다 — 이메일 필드로 인식돼 저장된 주소가
             자동완성 후보로 떴다. autoComplete="off" 로는 안 막힌다(브라우저가 대체로 무시한다).
             "text" 는 못 쓴다. 언어 키보드가 돌아와 IME 후보 바가 다시 뜬다.
             name 도 준다 — 이름 없는 필드는 브라우저가 내용을 넘겨짚는다 */
          lang="en"
          name="reading"
          inputMode="url"
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          /* 직전 화면이 「뜻은 알고 있었어요?」 라 뜻을 쓰는 칸으로 오해된다 (테스터 2026-09-14) */
          placeholder="읽는 법 (히라가나)"
          enterKeyHint="done"
          aria-label="읽기 입력"
          /* locked 여도 readonly/disabled 를 안 쓰는 이유는 위 주석대로다 — 대신 값이
             바뀌는 것 자체를 막는다. beforeinput 은 타이핑·IME·붙여넣기 전부를 값이
             바뀌기 전에 가로채므로 모바일 가상 키보드에서도 keydown 보다 안정적이다 */
          onBeforeInput={(e) => {
            if (locked) e.preventDefault()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {/* 원래 글자(has-diff 로 투명)와 똑같은 자리에, 같은 텍스트를 대조 색으로 덮어 그린다.
            input 은 글자별 색을 못 칠하니 이게 "입력창 안의 글자색이 바뀐" 것처럼 보이는 유일한 방법이다 */}
        {diff && (
          <div className="kana-input-diff" aria-hidden="true" lang="ja">
            {diff.map((d, i) => (
              <span key={i} className={d.match ? undefined : 'diff-wrong'}>
                {d.char}
              </span>
            ))}
          </div>
        )}
      </div>
      <button type="button" className="btn-primary" disabled={locked} onClick={submit}>
        확인
      </button>
    </div>
  )
}
