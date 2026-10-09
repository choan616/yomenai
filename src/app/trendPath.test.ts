// 추이 선의 부드러운 곡선 — 점을 지나고, 점 사이에서 값을 넘치지 않는다
import { describe, expect, it } from 'vitest'
import { smoothPath } from './trendPath.ts'

/** 경로 문자열에서 숫자만 뽑아 M/C 마디로 나눈다 */
function parse(d: string): { m: number[]; c: number[][] } {
  const [head, ...rest] = d.split('C')
  return {
    m: head!.slice(1).split(',').map(Number),
    c: rest.map((s) => s.split(/[ ,]/).filter(Boolean).map(Number)),
  }
}

describe('smoothPath', () => {
  it('점이 없으면 빈 경로, 하나면 이동만', () => {
    expect(smoothPath([])).toBe('')
    expect(smoothPath([{ x: 5, y: 7 }])).toBe('M5.0,7.0')
  })

  it('점 n개는 곡선 n-1마디이고 각 점을 그대로 지난다', () => {
    const pts = [
      { x: 0, y: 50 },
      { x: 40, y: 20 },
      { x: 90, y: 35 },
      { x: 100, y: 10 },
    ]
    const { m, c } = parse(smoothPath(pts))
    expect(m).toEqual([0, 50])
    expect(c).toHaveLength(3)
    c.forEach((seg, i) => expect(seg.slice(4)).toEqual([pts[i + 1]!.x, pts[i + 1]!.y]))
  })

  it('조절점이 이웃 두 점의 높이 밖으로 안 나간다 — 100% 를 넘거나 없던 오르내림이 안 생긴다', () => {
    // 급하게 오른 뒤 평평한 구간 — 일반 스플라인이면 평평한 구간 앞에서 출렁이는 모양이다
    const ys = [80, 30, 30, 30, 60, 10, 10, 90]
    const pts = ys.map((y, i) => ({ x: i * 17, y }))
    const { c } = parse(smoothPath(pts))
    c.forEach((seg, i) => {
      const lo = Math.min(ys[i]!, ys[i + 1]!)
      const hi = Math.max(ys[i]!, ys[i + 1]!)
      for (const y of [seg[1]!, seg[3]!]) {
        expect(y).toBeGreaterThanOrEqual(lo - 0.05)
        expect(y).toBeLessThanOrEqual(hi + 0.05)
      }
    })
  })

  it('같은 값이 이어지면 그 구간은 수평이다', () => {
    const { c } = parse(
      smoothPath([
        { x: 0, y: 30 },
        { x: 50, y: 30 },
        { x: 100, y: 30 },
      ]),
    )
    for (const seg of c) expect(new Set([seg[1], seg[3], seg[5]]).size).toBe(1)
  })
})
