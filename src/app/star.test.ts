// 담기 이벤트 모양 검증 — 「지금 담는 묶음」이 실리는지, 뺄 때 묶음을 안 싣는지 (2026-10-06)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LIST } from '../core/types.ts'
import { starEvent } from './star.ts'

function stubStorage(seed: Record<string, string> = {}): void {
  const map = new Map(Object.entries(seed))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
}

describe('starEvent', () => {
  afterEach(() => vi.unstubAllGlobals())
  beforeEach(() => stubStorage())

  it('담을 때 지금 담는 묶음이 실린다', () => {
    stubStorage({ 'yomenai:wordlistCurrent': '소설 B' })
    expect(starEvent('1234', true)).toMatchObject({
      idiomId: '1234',
      type: 'star',
      on: true,
      cardType: 'reading',
      list: '소설 B',
    })
  })

  it('기본 묶음이면 묶음을 안 싣는다 — 옛 이벤트와 같은 모양이다', () => {
    stubStorage({ 'yomenai:wordlistCurrent': DEFAULT_LIST })
    expect(starEvent('1234', true)).not.toHaveProperty('list')
  })

  it('뺄 때는 묶음을 안 싣는다', () => {
    stubStorage({ 'yomenai:wordlistCurrent': '소설 B' })
    const e = starEvent('1234', false)
    expect(e.on).toBe(false)
    expect(e).not.toHaveProperty('list')
  })
})
