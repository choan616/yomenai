// 정답률 추이 — 날마다 판정 창(최근 7일, 모자라면 100회), 표본 문턱, 범위, 수준 표와 같은 값
import { describe, expect, it } from 'vitest'
import { accuracyTrends, TREND_DAYS, TREND_MIN_POINTS } from './accuracyTrend.ts'
import { buildLevel } from './level.ts'
import type { Band } from '../lib/bands.ts'
import type { ReviewEvent } from './types.ts'

const band: Record<string, Band> = { b0: 0, b1: 1, b2: 2, b4: 4 }
const bandOf = (id: string) => band[id.slice(0, 2)]
const TODAY = '2026-10-09'
let n = 0
/** `day` 의 정오에 한 번 채점 — 같은 날 안의 순서는 n 이 정한다 */
const ev = (
  idiomId: string,
  correct: boolean,
  day: string,
  over: Partial<Pick<ReviewEvent, 'cardType' | 'deletedAt'>> = {},
): ReviewEvent => ({
  id: `e${n++}`,
  userId: 'local',
  deviceId: 'd',
  at: new Date(`${day}T12:00:00`).getTime() + n,
  idiomId,
  cardType: 'reading',
  mistakeType: null,
  deletedAt: null,
  type: 'review',
  grade: correct ? 3 : 1,
  answer: '',
  expected: '',
  correct,
  elapsedMs: 1,
  ...over,
})
/** 코스 `prefix` 의 서로 다른 표현으로 정답 c · 오답 w 개 */
const many = (prefix: string, c: number, w: number, day: string): ReviewEvent[] => [
  ...Array.from({ length: c }, (_, i) => ev(`${prefix}-${i}`, true, day)),
  ...Array.from({ length: w }, (_, i) => ev(`${prefix}-${c + i}`, false, day)),
]

describe('accuracyTrends', () => {
  it('학습한 날마다 한 점이고, 값은 그날 끝의 판정 창이다', () => {
    // 10/1 에 40개 중 정답 32(80%) → 10/3 에 정답 40 더 — 7일 창이 100회에 못 미치니 최근 100회까지 넓힌다
    const events = [...many('b0', 32, 8, '2026-10-01'), ...many('b0', 40, 0, '2026-10-03')]
    const t = accuracyTrends(events, bandOf, TODAY).get('all')!
    expect(t.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-03'])
    expect(t[0]).toMatchObject({ n: 40 })
    expect(t[0]!.rate).toBeCloseTo(32 / 40)
    expect(t[1]).toMatchObject({ n: 80 })
    expect(t[1]!.rate).toBeCloseTo(72 / 80) // 쉰 날이 사이에 있어도 이어서 센다
  })

  it('창이 점을 찍는 최소 크기 미만인 동안은 점이 없다', () => {
    const t = accuracyTrends(many('b0', TREND_MIN_POINTS - 1, 0, '2026-10-01'), bandOf, TODAY)
    expect(t.get('all')).toBeUndefined()
  })

  it('창 밖의 옛 기록은 값에서 빠진다 — 마지막 채점일 기준 7일, 모자라면 100회', () => {
    // 9/1 에 100번 다 틀리고 10/8 에 150번을 다 맞혔다. 10/8 기준 7일 창은 150회라 옛 기록이 안 들어온다
    const events = [...many('b0', 0, 100, '2026-09-01'), ...many('b0', 150, 0, '2026-10-08')]
    const last = accuracyTrends(events, bandOf, TODAY).get('all')!.at(-1)!
    expect(last.rate).toBe(1)
    expect(last.n).toBe(150)
  })

  it('코스 4·뜻 카드·삭제된 기록·출제 범위 밖은 세지 않는다', () => {
    const events = [
      ...many('b4', 0, 100, '2026-10-01'),
      ...many('b0', 40, 0, '2026-10-01'),
      ev('b0-x', false, '2026-10-01', { cardType: 'meaning' }),
      ev('b0-y', false, '2026-10-01', { deletedAt: 1 }),
      ev('zz-1', false, '2026-10-01'),
    ]
    const trends = accuracyTrends(events, bandOf, TODAY)
    const t = trends.get('all')!
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ rate: 1, n: 40 })
    expect(trends.has(4 as Band)).toBe(false)
  })

  it('전체는 코스를 합산하고, 코스 계열은 그 코스만 센다', () => {
    const events = [...many('b0', 40, 0, '2026-10-01'), ...many('b1', 0, 40, '2026-10-02')]
    const trends = accuracyTrends(events, bandOf, TODAY)
    expect(trends.get('all')!.at(-1)!.rate).toBeCloseTo(0.5)
    expect(trends.get(0)!.map((p) => p.rate)).toEqual([1])
    expect(trends.get(1)!.map((p) => p.rate)).toEqual([0])
  })

  it('최근 4주 밖의 날은 점으로 안 낸다 — 값에는 들어간다', () => {
    const events = [...many('b0', 40, 0, '2026-08-01'), ...many('b0', 0, 80, '2026-10-08')]
    const t = accuracyTrends(events, bandOf, TODAY).get('all')!
    expect(t.map((p) => p.date)).toEqual(['2026-10-08'])
    // 10/8 기준 7일 창 = 80회, 100회에 못 미쳐 최근 100회까지 넓히니 8/1 의 정답 20개가 들어온다
    expect(t[0]!.n).toBe(100)
    expect(t[0]!.rate).toBeCloseTo(20 / 100)
    // 4주의 첫날은 포함, 그 전날은 제외
    const edge = accuracyTrends(
      [...many('b0', 40, 0, '2026-09-12'), ...many('b0', 40, 0, '2026-09-11')],
      bandOf,
      TODAY,
    ).get('all')!
    expect(TREND_DAYS).toBe(28)
    expect(edge.map((p) => p.date)).toEqual(['2026-09-12'])
  })

  it('수준 표와 같은 값이다 — 코스별 마지막 점 = buildLevel 의 그 코스 정답률', () => {
    const events = [
      ...many('b0', 70, 20, '2026-09-20'),
      ...many('b0', 30, 12, '2026-10-05'),
      ...many('b1', 80, 30, '2026-10-06'),
      ...many('b2', 40, 8, '2026-10-08'),
    ]
    const trends = accuracyTrends(events, bandOf, TODAY)
    for (const row of buildLevel(events, bandOf).bands) {
      if (row.seen < TREND_MIN_POINTS || row.band > 3) continue
      expect(trends.get(row.band as Band)!.at(-1)!.rate).toBeCloseTo(row.rate)
      expect(trends.get(row.band as Band)!.at(-1)!.n).toBe(row.seen)
    }
  })
})
