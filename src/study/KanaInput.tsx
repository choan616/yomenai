// 로마자를 히라가나로 변환하는 읽기 입력 필드. wanakana 를 요소에 bind 한다 (PLAN §3)
import { useEffect, useRef } from 'react'
import { bind, unbind } from 'wanakana'

interface Props {
  onSubmit: (value: string) => void
  disabled?: boolean
}

export function KanaInput({ onSubmit, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null)

  /**
   * 빈/공백뿐인 값은 제출하지 않는다. 다음 문제로 넘어가면 입력창이 auto-focus 되는데,
   * "입력→Enter" 리듬으로 빠르게 치는 사용자가 새 문제를 읽기 전에 Enter 를 눌러
   * 빈 답이 오답으로 채점되던 버그를 막는다 (진단·세션 공통, context-notes 2026-09-06).
   */
  const submit = () => {
    const value = ref.current?.value ?? ''
    if (value.trim() === '') return
    onSubmit(value)
  }

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

  return (
    <div className="answer-row input">
      <input
        ref={ref}
        className="kana-input"
        lang="ja"
        type="text"
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        disabled={disabled}
        aria-label="읽기 입력"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button type="button" className="btn-primary" disabled={disabled} onClick={submit}>
        확인
      </button>
    </div>
  )
}
