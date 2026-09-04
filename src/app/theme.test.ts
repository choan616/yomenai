// 다크 모드 토글 검증 — 저장값 파싱과 root data-theme 적용
import { describe, expect, it } from 'vitest'
import { applyTheme, parseTheme } from './theme.ts'

describe('parseTheme', () => {
  it('light/dark 만 통과, 나머지는 system', () => {
    expect(parseTheme('light')).toBe('light')
    expect(parseTheme('dark')).toBe('dark')
    expect(parseTheme(null)).toBe('system')
    expect(parseTheme('system')).toBe('system')
    expect(parseTheme('bogus')).toBe('system')
  })
})

describe('applyTheme', () => {
  it('light/dark 는 data-theme 을 세우고 system 은 지운다', () => {
    const root = { dataset: {} as HTMLElement['dataset'] }
    applyTheme('dark', root)
    expect(root.dataset.theme).toBe('dark')
    applyTheme('light', root)
    expect(root.dataset.theme).toBe('light')
    applyTheme('system', root)
    expect(root.dataset.theme).toBeUndefined()
  })
})
