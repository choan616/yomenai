// 「오늘은 짧게」 토스트 판정 검증 — 문턱 시각·오늘 칸·하루 한 번·저장소가 막힌 경우
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markNudgeShown, NUDGE_HOUR, shouldNudge } from './nudgeToast.ts'

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
  return map
}

/** 2026-09-15 의 그 시각(로컬) */
function at(hour: number): number {
  return new Date(2026, 8, 15, hour, 0, 0).getTime()
}

const DAY = '2026-09-15'

describe('shouldNudge', () => {
  beforeEach(() => void stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('문턱 전에는 안 권한다', () => {
    expect(shouldNudge(false, DAY, at(NUDGE_HOUR - 1))).toBe(false)
  })

  it('문턱이 되면 권한다', () => {
    expect(shouldNudge(false, DAY, at(NUDGE_HOUR))).toBe(true)
    expect(shouldNudge(false, DAY, at(23))).toBe(true)
  })

  it('오늘 칸을 이미 채웠으면 시각과 무관하게 안 권한다', () => {
    expect(shouldNudge(true, DAY, at(23))).toBe(false)
  })

  it('그날 한 번 띄우면 다시 안 권한다 — 날이 바뀌면 다시 권한다', () => {
    markNudgeShown(DAY)
    expect(shouldNudge(false, DAY, at(23))).toBe(false)
    expect(shouldNudge(false, '2026-09-16', at(23))).toBe(true)
  })

  it('저장소가 막혀도 던지지 않고, 안 띄운 것으로 본다', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(() => markNudgeShown(DAY)).not.toThrow()
    expect(shouldNudge(false, DAY, at(23))).toBe(true)
  })
})
