// 인트로를 보일 때인지 — 하루 한 번, 모션 줄임·저장소 막힘에서는 안 보임, 개발 빌드는 열쇠가 있어야 보임
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { introDue, markIntroShown } from './introState.ts'

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

describe('introDue', () => {
  it('처음에는 보인다', () => {
    expect(introDue('2026-10-05', PROD)).toBe(true)
  })

  it('보였다고 기록한 날에는 다시 안 보이고, 다음 날 다시 보인다', () => {
    markIntroShown('2026-10-05')
    expect(introDue('2026-10-05', PROD)).toBe(false)
    expect(introDue('2026-10-06', PROD)).toBe(true)
  })

  it('모션 줄이기에서는 안 보인다', () => {
    expect(introDue('2026-10-05', { ...PROD, reducedMotion: true })).toBe(false)
  })

  it('저장소가 막혀 있으면 안 보인다 (기억을 못 하면 열 때마다 보이므로)', () => {
    storage({}, true)
    expect(introDue('2026-10-05', PROD)).toBe(false)
  })

  it('개발 빌드는 열쇠가 있어야 보인다', () => {
    expect(introDue('2026-10-05', { reducedMotion: false, dev: true })).toBe(false)
    storage({ 'yomenai:intro': '1' })
    expect(introDue('2026-10-05', { reducedMotion: false, dev: true })).toBe(true)
  })
})
