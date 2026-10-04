// 눈금이 있는 단색 range — 설정의 켬/끔·단계 선택이 쓴다 (2026-10-04 사용자 「토글을 가능하면 전부 레인지로, 단색 계열로」)
//
// 끌어서도 고르고, 눈금 글자를 눌러서도 고른다. 눈금 글자는 `aria-pressed` 버튼이라 보조 기술·키보드는 그쪽을 쓴다 —
// range 자체는 눈으로 끄는 손잡이라 `aria-hidden` 이다 (같은 값을 두 번 읽히지 않으려고).
import type { CSSProperties } from 'react'

export interface StepOption {
  label: string
  /** 이 환경에서 못 고르는 눈금(예: 진동을 못 쓰는 기기) */
  disabled?: boolean
}

export function StepSlider({
  label,
  options,
  index,
  onPick,
}: {
  /** 그룹 이름 — 접근 가능한 이름이다 */
  label: string
  options: readonly StepOption[]
  /** 지금 고른 눈금. 눈금에 없는 값이면 -1 */
  index: number
  onPick: (i: number) => void
}) {
  const last = options.length - 1
  const shown = Math.max(0, index)
  const style = { '--f': last > 0 ? shown / last : 0 } as CSSProperties
  return (
    <div className="stepslider" role="group" aria-label={label} style={style}>
      <input
        type="range"
        className="step-range"
        min={0}
        max={last}
        step={1}
        value={shown}
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const i = Number(e.target.value)
          if (!options[i]?.disabled) onPick(i)
        }}
      />
      <div className="step-ticks">
        {options.map((o, i) => (
          <button
            key={o.label}
            type="button"
            className="step-tick"
            style={{ '--f': last > 0 ? i / last : 0 } as CSSProperties}
            aria-pressed={i === index}
            disabled={o.disabled}
            onClick={() => onPick(i)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}
