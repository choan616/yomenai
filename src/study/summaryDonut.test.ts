// 요약 도넛 — 맞은 호가 앞, 틈 없이 맞닿고, 카드 한 장이 한 칸이 되도록 구분선이 선다
import { describe, expect, it } from 'vitest'
import { DONUT_MAX_SEGMENTS, donutArcs } from './summaryDonut.ts'

const C = 100

describe('donutArcs', () => {
  it('기록이 없으면 호도 구분선도 없다', () => {
    expect(donutArcs(0, 0, C)).toEqual({ right: 0, wrong: 0, seps: [] })
  })

  it('전부 맞아도 카드 수만큼 구분선이 선다 (연달아 맞은 것도 장수가 읽힌다)', () => {
    const { right, wrong, seps } = donutArcs(20, 20, C)
    expect(right).toBe(C)
    expect(wrong).toBe(0)
    expect(seps).toHaveLength(20)
    expect(seps[1]).toBeCloseTo(5)
  })

  it('전부 틀려도 카드 수만큼', () => {
    const { right, wrong, seps } = donutArcs(0, 4, C)
    expect(right).toBe(0)
    expect(wrong).toBe(C)
    expect(seps).toEqual([0, 25, 50, 75])
  })

  it('섞이면 비율대로 한 바퀴를 채우고, 맞음/틀림 경계가 구분선 위치에 든다', () => {
    const { right, wrong, seps } = donutArcs(15, 20, C)
    expect(right).toBeCloseTo(75)
    expect(wrong).toBeCloseTo(25)
    expect(seps).toHaveLength(20)
    expect(seps.some((s) => Math.abs(s - 75) < 1e-9)).toBe(true)
  })

  it('카드가 많으면 경계에만 긋는다', () => {
    const n = DONUT_MAX_SEGMENTS + 10
    expect(donutArcs(n / 2, n, C).seps).toEqual([0, 50])
    expect(donutArcs(n, n, C).seps).toEqual([])
  })
})
