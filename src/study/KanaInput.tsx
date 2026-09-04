// 로마자를 히라가나로 변환하는 읽기 입력 필드. wanakana 를 요소에 bind 한다 (PLAN §3)
import { useEffect, useRef } from 'react'
import { bind, unbind } from 'wanakana'

interface Props {
  onSubmit: (value: string) => void
  disabled?: boolean
}

export function KanaInput({ onSubmit, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null)

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
    <div className="answer-row">
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
            onSubmit(ref.current?.value ?? '')
          }
        }}
      />
      <button
        type="button"
        className="btn-primary"
        disabled={disabled}
        onClick={() => onSubmit(ref.current?.value ?? '')}
      >
        확인
      </button>
    </div>
  )
}
