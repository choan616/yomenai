// 요약 도넛 — 푼 순서대로 정오 호가 서고, 가운데 배지는 많은 쪽 색을 따른다
import { describe, expect, it } from 'vitest'
import { DONUT_MAX_SEGMENTS, donutSegments, sealTone } from './summaryDonut.ts'

const C = 100

describe('donutSegments', () => {
  it('기록이 없으면 호도 구분선도 없다', () => {
    expect(donutSegments([], C)).toEqual({ arcs: [], seps: [] })
  })

  it('푼 순서 그대로 정·오·정·오 로 번갈아 선다', () => {
    const { arcs, seps } = donutSegments([true, false, true, false], C)
    expect(arcs.map((a) => a.ok)).toEqual([true, false, true, false])
    expect(arcs.map((a) => a.from)).toEqual([0, 25, 50, 75])
    expect(arcs.every((a) => a.len === 25)).toBe(true)
    expect(seps).toEqual([0, 25, 50, 75])
  })

  it('순서가 다르면 호도 다르다 — 오답이 앞에 몰렸으면 앞쪽이 빨갛다', () => {
    const { arcs } = donutSegments([false, false, true, true], C)
    expect(arcs.map((a) => a.ok)).toEqual([false, false, true, true])
  })

  it('전부 맞아도 카드 수만큼 나뉜다 (연달아 맞은 것도 장수가 읽힌다)', () => {
    const { arcs, seps } = donutSegments(Array(20).fill(true), C)
    expect(arcs).toHaveLength(20)
    expect(seps).toHaveLength(20)
  })

  it('호가 한 바퀴를 틈 없이 채운다', () => {
    const { arcs } = donutSegments([true, true, false], C)
    expect(arcs.reduce((s, a) => s + a.len, 0)).toBeCloseTo(C)
  })

  it('카드가 많으면 같은 결과가 이어진 구간을 한 호로 묶고 바뀌는 곳에만 긋는다', () => {
    const n = DONUT_MAX_SEGMENTS + 10
    const results = Array.from({ length: n }, (_, i) => i < n / 2)
    const { arcs, seps } = donutSegments(results, C)
    expect(arcs).toHaveLength(2)
    expect(arcs[0]).toMatchObject({ ok: true, from: 0 })
    expect(arcs[0]!.len).toBeCloseTo(50)
    expect(seps).toHaveLength(2)
  })

  it('카드가 많고 결과가 하나뿐이면 구분선이 없다', () => {
    expect(donutSegments(Array(DONUT_MAX_SEGMENTS + 5).fill(true), C).seps).toEqual([])
  })
})

describe('sealTone', () => {
  it('오답이 많으면 miss', () => {
    expect(sealTone([false, false, true])).toBe('miss')
  })
  it('정답이 많으면 ok', () => {
    expect(sealTone([true, true, false])).toBe('ok')
  })
  it('같으면 ok — 반반일 때 빨갛게 몰아세우지 않는다', () => {
    expect(sealTone([true, false])).toBe('ok')
  })
  it('기록이 없으면 ok', () => {
    expect(sealTone([])).toBe('ok')
  })
})
