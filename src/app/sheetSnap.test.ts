// 시트 끌기 결과 판정 검증
import { describe, expect, it } from 'vitest'
import { nextSnap } from './sheetSnap.ts'

const PEEK = 400
const FULL = 800

describe('nextSnap — 느리게 놓았을 때는 위치를 따른다', () => {
  it('처음 높이 근처에서 놓으면 처음 높이', () => {
    expect(nextSnap(420, PEEK, FULL, 0)).toBe('peek')
  })

  it('중간점을 넘게 끌어올렸으면 전체 높이', () => {
    expect(nextSnap(601, PEEK, FULL, 0)).toBe('full')
    expect(nextSnap(599, PEEK, FULL, 0)).toBe('peek')
  })

  it('처음 높이의 60% 아래로 내렸으면 닫는다', () => {
    expect(nextSnap(239, PEEK, FULL, 0)).toBe('close')
    expect(nextSnap(241, PEEK, FULL, 0)).toBe('peek')
  })
})

describe('nextSnap — 빠르게 튕기면 방향을 따른다', () => {
  it('빨리 올리면 위치와 상관없이 전체 높이', () => {
    expect(nextSnap(410, PEEK, FULL, 0.8)).toBe('full')
  })

  it('전체 높이에서 빨리 내리면 처음 높이로(한 번에 닫지 않는다)', () => {
    expect(nextSnap(700, PEEK, FULL, -0.8)).toBe('peek')
  })

  it('처음 높이에서 빨리 내리면 닫는다', () => {
    expect(nextSnap(390, PEEK, FULL, -0.8)).toBe('close')
  })

  it('경계 속도(0.5)는 튕긴 것으로 안 친다', () => {
    expect(nextSnap(410, PEEK, FULL, 0.5)).toBe('peek')
  })
})
