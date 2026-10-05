// 요약 도넛의 호 길이 — 맞은 호가 앞, 둘 다 있을 때만 틈
import { describe, expect, it } from 'vitest'
import { DONUT_GAP, donutArcs } from './summaryDonut.ts'

const C = 100

describe('donutArcs', () => {
  it('기록이 없으면 호가 없다', () => {
    expect(donutArcs(0, 0, C)).toEqual({ right: 0, wrong: 0 })
  })

  it('전부 맞으면 한 바퀴, 틈 없음', () => {
    expect(donutArcs(20, 20, C)).toEqual({ right: C, wrong: 0 })
  })

  it('전부 틀리면 틀린 호가 한 바퀴', () => {
    expect(donutArcs(0, 20, C)).toEqual({ right: 0, wrong: C })
  })

  it('섞이면 비율대로, 맞닿는 두 곳의 틈만큼 줄어든다', () => {
    const { right, wrong } = donutArcs(15, 20, C)
    expect(right).toBeCloseTo(75 - DONUT_GAP)
    expect(wrong).toBeCloseTo(25 - DONUT_GAP)
    // 두 호 + 두 틈 = 한 바퀴
    expect(right + wrong + DONUT_GAP * 2).toBeCloseTo(C)
  })

  it('아주 작은 쪽도 음수가 되지 않는다', () => {
    const { right, wrong } = donutArcs(99, 100, 10)
    expect(right).toBeGreaterThan(0)
    expect(wrong).toBe(0)
  })
})
