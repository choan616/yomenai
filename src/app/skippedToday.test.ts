// 오늘 넘긴 표기 기억 검증 — 날이 바뀌면 버리는지, 저장소가 막혀도 던지지 않는지
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addSkipped, loadSkipped } from './skippedToday.ts'

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
  return map
}

describe('skippedToday', () => {
  beforeEach(() => void stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('넘긴 표기를 같은 날에는 기억한다', () => {
    expect(loadSkipped('2026-10-13').size).toBe(0)
    addSkipped('2026-10-13', '代替')
    addSkipped('2026-10-13', '幻滅')
    expect([...loadSkipped('2026-10-13')]).toEqual(['代替', '幻滅'])
  })

  it('같은 표기를 두 번 넘겨도 하나로 둔다', () => {
    addSkipped('2026-10-13', '代替')
    addSkipped('2026-10-13', '代替')
    expect(loadSkipped('2026-10-13').size).toBe(1)
  })

  it('날이 바뀌면 버린다 — 어제 넘긴 것은 오늘 다시 내밀어도 된다', () => {
    addSkipped('2026-10-13', '代替')
    expect(loadSkipped('2026-10-14').size).toBe(0)
  })

  it('값이 깨져 있어도 던지지 않는다', () => {
    const map = stubStorage()
    map.set('yomenai:skippedToday', '{{{')
    expect(loadSkipped('2026-10-13').size).toBe(0)
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(loadSkipped('2026-10-13').size).toBe(0)
    expect(() => addSkipped('2026-10-13', '代替')).not.toThrow()
  })
})
