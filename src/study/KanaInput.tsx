// 로마자를 히라가나로 변환하는 읽기 입력 필드. wanakana 를 요소에 bind 한다 (PLAN §3).
// iOS 스탠드얼론 대응 — 카드마다 리마운트하지 않고(포커스 유지) resetKey 로 값만 비운다.
// lang="ja" 를 빼고 inputMode="latin" 으로 일본어 IME 한자 변환을 억제한다.
import { useEffect, useRef } from 'react'
import { bind, unbind } from 'wanakana'

interface Props {
  onSubmit: (value: string) => void
  /** 카드가 바뀔 때마다 값을 비우는 트리거. 컴포넌트는 그대로 두고(포커스 유지) 값만 리셋 */
  resetKey: string | number
  /** 피드백 중엔 편집 못 하게. disabled 와 달리 readonly 는 iOS 에서 포커스·키보드를 유지한다 */
  readOnly?: boolean
}

export function KanaInput({ onSubmit, resetKey, readOnly }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  /**
   * 빈/공백뿐인 값은 제출하지 않는다. 다음 문제로 넘어가면 입력창이 auto-focus 되는데,
   * "입력→Enter" 리듬으로 빠르게 치는 사용자가 새 문제를 읽기 전에 Enter 를 눌러
   * 빈 답이 오답으로 채점되던 버그를 막는다 (진단·세션 공통, context-notes 2026-09-06).
   */
  const submit = () => {
    if (readOnly) return
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

  // 카드가 바뀌면 값만 비운다 (리마운트 아님 → 포커스 유지). readOnly 변화로는 안 비운다 —
  // 피드백이 뜰 때 방금 친 답을 지우면 안 되니까
  useEffect(() => {
    const el = ref.current
    if (el) el.value = ''
  }, [resetKey])

  // 카드가 바뀌거나 피드백이 닫히면 포커스를 다시 잡는다 (데스크톱용, iOS 는 이미 유지)
  useEffect(() => {
    const el = ref.current
    if (el && !readOnly) el.focus()
  }, [resetKey, readOnly])

  return (
    <div className="answer-row input">
      <input
        ref={ref}
        className="kana-input"
        type="text"
        /* 일본어 IME(한자 변환 후보 바)를 막는다. iOS 는 변환 바를 숨기는 API 가 없어서
           inputMode="email" 로 ASCII 전용 키보드를 띄운다(언어 키보드가 아니라 후보 바 없음).
           키보드에 @ · . 키가 더 보이는 게 대가. wanakana 가 로마자→가나 변환은 그대로 한다.
           lang="en" · autocorrect/autocomplete off 도 함께 */
        lang="en"
        inputMode="email"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        readOnly={readOnly}
        aria-label="읽기 입력"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button type="button" className="btn-primary" disabled={readOnly} onClick={submit}>
        확인
      </button>
    </div>
  )
}
