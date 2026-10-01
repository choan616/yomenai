// 단어장 보기 기억 검증 — 기본값·저장·깨진 값·저장소가 막힌 경우
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  hasWordlistHint,
  loadWordlistView,
  saveWordlistView,
  setWordlistHint,
} from './wordlistView.ts'

function stubStorage(): Map<string, string> {
  const map = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  })
  return map
}

describe('wordlistView', () => {
  beforeEach(() => void stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('저장한 적이 없으면 리스트다', () => {
    expect(loadWordlistView()).toBe('list')
  })

  it('카드로 저장하면 다음에도 카드고, 리스트로 돌리면 기본으로 돌아간다', () => {
    saveWordlistView('card')
    expect(loadWordlistView()).toBe('card')
    saveWordlistView('list')
    expect(loadWordlistView()).toBe('list')
  })

  it('깨진 값은 리스트로 읽는다', () => {
    localStorage.setItem('yomenai:wordlistView', 'grid')
    expect(loadWordlistView()).toBe('list')
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadWordlistView()).toBe('list')
    expect(() => saveWordlistView('card')).not.toThrow()
  })
})

describe('wordlistHint', () => {
  beforeEach(() => void stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('남긴 적이 없으면 없다 → 세우면 있다 → 내리면 다시 없다', () => {
    expect(hasWordlistHint()).toBe(false)
    setWordlistHint(true)
    expect(hasWordlistHint()).toBe(true)
    setWordlistHint(false)
    expect(hasWordlistHint()).toBe(false)
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    expect(hasWordlistHint()).toBe(false)
    expect(() => setWordlistHint(true)).not.toThrow()
  })
})
