// 글자 크기 설정 — 일본어 학습 카드(study.css) 밖 텍스트만 대상(screens.css). root 의
// data-text-scale 로 CSS 가 분기 (src/index.css --ui-scale)
export type TextScale = 'sm' | 'md' | 'lg'

const KEY = 'yomenai:textScale'

export function parseTextScale(raw: unknown): TextScale {
  return raw === 'sm' || raw === 'lg' ? raw : 'md'
}

export function loadTextScale(): TextScale {
  try {
    return parseTextScale(localStorage.getItem(KEY))
  } catch {
    return 'md'
  }
}

export function saveTextScale(scale: TextScale): void {
  try {
    if (scale === 'md') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, scale)
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 세션 한정
  }
}

/** md 면 data-text-scale 을 지워 기본값(--ui-scale: 1)으로 되돌린다 */
export function applyTextScale(
  scale: TextScale,
  root: Pick<HTMLElement, 'dataset'> = document.documentElement,
): void {
  if (scale === 'md') delete root.dataset.textScale
  else root.dataset.textScale = scale
}
