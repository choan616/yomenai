// 끝말잇기 기록 검증 — 최고 연결·판 수, 한 개도 못 이은 판, 깨진 저장값
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadShiritoriRecord, recordGame } from './shiritoriRecord.ts'

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const store = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  })
  return store
}

beforeEach(() => {
  vi.unstubAllGlobals()
  installStorage()
})

describe('recordGame', () => {
  it('첫 판은 그대로 새 기록이다', () => {
    expect(recordGame(5)).toEqual({ best: 5, plays: 1, isNewBest: true })
    expect(loadShiritoriRecord()).toEqual({ best: 5, plays: 1 })
  })

  it('이전 최고를 넘어야 새 기록이고, 같거나 낮으면 최고는 그대로 판 수만 는다', () => {
    recordGame(5)
    expect(recordGame(8)).toEqual({ best: 8, plays: 2, isNewBest: true })
    expect(recordGame(8)).toEqual({ best: 8, plays: 3, isNewBest: false })
    expect(recordGame(3)).toEqual({ best: 8, plays: 4, isNewBest: false })
  })

  it('한 개도 못 이은 판은 판으로 안 센다', () => {
    recordGame(4)
    expect(recordGame(0)).toEqual({ best: 4, plays: 1, isNewBest: false })
    expect(loadShiritoriRecord()).toEqual({ best: 4, plays: 1 })
  })
})

describe('loadShiritoriRecord', () => {
  it('기록이 없으면 0', () => {
    expect(loadShiritoriRecord()).toEqual({ best: 0, plays: 0 })
  })

  it('깨진 값은 0 으로 받는다', () => {
    installStorage({ 'yomenai:shiritori': '{oops' })
    expect(loadShiritoriRecord()).toEqual({ best: 0, plays: 0 })
    installStorage({ 'yomenai:shiritori': JSON.stringify({ best: -3, plays: 'x' }) })
    expect(loadShiritoriRecord()).toEqual({ best: 0, plays: 0 })
  })

  it('저장소가 막혀도 던지지 않는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(loadShiritoriRecord()).toEqual({ best: 0, plays: 0 })
    expect(recordGame(2).best).toBe(2)
  })
})
