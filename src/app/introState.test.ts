// 인트로를 어떤 판으로 보일지 — 하루 첫 실행은 전체판, 같은 날 다시 열면 빠른 판, 모션 줄임·저장소 막힘은 없음, 개발 빌드는 열쇠가 있어야 함
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { introMode, markIntroShown } from './introState.ts'

function storage(initial: Record<string, string> = {}, blocked = false): Map<string, string> {
  const m = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => {
      if (blocked) throw new Error('blocked')
      return m.get(k) ?? null
    },
    setItem: (k: string, v: string) => {
      if (blocked) throw new Error('blocked')
      m.set(k, v)
    },
    removeItem: (k: string) => void m.delete(k),
  })
  return m
}

const PROD = { reducedMotion: false, dev: false }

beforeEach(() => {
  vi.unstubAllGlobals()
  storage()
})

describe('introMode', () => {
  it('하루 첫 실행은 전체판', () => {
    expect(introMode('2026-10-05', PROD)).toBe('full')
  })

  it('같은 날 다시 열면 빠른 판, 다음 날은 다시 전체판', () => {
    markIntroShown('2026-10-05')
    expect(introMode('2026-10-05', PROD)).toBe('quick')
    expect(introMode('2026-10-06', PROD)).toBe('full')
  })

  it('모션 줄이기에서는 안 보인다', () => {
    expect(introMode('2026-10-05', { ...PROD, reducedMotion: true })).toBeNull()
  })

  it('저장소가 막혀 있으면 안 보인다 (기억을 못 하면 열 때마다 전체판이 뜨므로)', () => {
    storage({}, true)
    expect(introMode('2026-10-05', PROD)).toBeNull()
  })

  it('개발 빌드는 열쇠가 있어야 보인다', () => {
    expect(introMode('2026-10-05', { reducedMotion: false, dev: true })).toBeNull()
    storage({ 'yomenai:intro': '1' })
    expect(introMode('2026-10-05', { reducedMotion: false, dev: true })).toBe('full')
  })
})
