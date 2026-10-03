// 소리 취향 기억 검증 — 기본값·저장·깨진 값·저장소가 막힌 경우
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadTtsPrefs, RATE_VALUE, saveTtsPrefs } from './ttsPrefs.ts'

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
  return map
}

describe('ttsPrefs', () => {
  beforeEach(() => void stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('저장한 적이 없으면 자동 음성·보통 속도다', () => {
    expect(loadTtsPrefs()).toEqual({ voice: '', rate: 'normal' })
  })

  it('보통 속도는 예전 고정값 0.9 와 같다 — 기본 소리를 안 바꾼다', () => {
    expect(RATE_VALUE.normal).toBe(0.9)
  })

  it('저장하면 다음에도 그대로다', () => {
    saveTtsPrefs({ voice: 'Microsoft Nanami Online (Natural)', rate: 'slow' })
    expect(loadTtsPrefs()).toEqual({ voice: 'Microsoft Nanami Online (Natural)', rate: 'slow' })
  })

  it('깨진 값은 기본값으로 읽는다 — 소리는 나야 한다', () => {
    localStorage.setItem('yomenai:tts', '{not json')
    expect(loadTtsPrefs()).toEqual({ voice: '', rate: 'normal' })
    localStorage.setItem('yomenai:tts', JSON.stringify({ voice: 3, rate: 'warp' }))
    expect(loadTtsPrefs()).toEqual({ voice: '', rate: 'normal' })
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(loadTtsPrefs()).toEqual({ voice: '', rate: 'normal' })
    expect(() => saveTtsPrefs({ voice: 'x', rate: 'fast' })).not.toThrow()
  })
})
