// 다크 모드 토글 — OS 설정(system) 위에 사용자 선택을 얹는다. root 의 data-theme 로 CSS 가 분기
export type Theme = 'system' | 'light' | 'dark'

const KEY = 'yomenai:theme'

export function parseTheme(raw: unknown): Theme {
  return raw === 'light' || raw === 'dark' ? raw : 'system'
}

export function loadTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(KEY))
  } catch {
    return 'system'
  }
}

export function saveTheme(theme: Theme): void {
  try {
    if (theme === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, theme)
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 세션 한정
  }
}

/** system 이면 data-theme 을 지워 `prefers-color-scheme` 로 되돌린다 */
export function applyTheme(
  theme: Theme,
  root: Pick<HTMLElement, 'dataset'> = document.documentElement,
): void {
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
}
