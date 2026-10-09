// 정답률 추이 — 날마다 최근 30회, 표본 문턱, 범위, 수준 표와 같은 값
import { describe, expect, it } from 'vitest'
import { accuracyTrends, TREND_DAYS } from './accuracyTrend.ts'
import { buildLevel, LEVEL_MIN_SEEN, LEVEL_WINDOW } from './level.ts'
import type { Band } from '../lib/bands.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

const band: Record<string, Band> = { b0: 0, b1: 1, b2: 2, b4: 4 }
const TODAY = '2026-10-09'
let n = 0
/** `day` 의 정오에 한 번 채점 — 같은 날 안의 순서는 n 이 정한다 */
const ev = (
  idiomId: string,
  correct: boolean,
  day: string,
  over: Partial<Pick<ReviewEvent, 'cardType' | 'deletedAt'>> = {},
): LearningEvent => ({
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
const many = (idiomId: string, c: number, w: number, day: string): LearningEvent[] => [
  ...Array.from({ length: c }, () => ev(idiomId, true, day)),
  ...Array.from({ length: w }, () => ev(idiomId, false, day)),
]
const bandOf = (id: string) => band[id]

describe('accuracyTrends', () => {
  it('학습한 날마다 한 점이고, 값은 그날까지 최근 30회다', () => {
    const events = [...many('b0', 4, 1, '2026-10-01'), ...many('b0', 5, 0, '2026-10-03')]
    const t = accuracyTrends(events, bandOf, TODAY).get('all')!
    expect(t.map((p) => p.date)).toEqual(['2026-10-01', '2026-10-03'])
    expect(t[0]!.rate).toBeCloseTo(4 / 5)
    expect(t[1]!.rate).toBeCloseTo(9 / 10) // 쉰 날이 사이에 있어도 이어서 센다
    expect(t[1]!.n).toBe(10)
  })

  it('표본이 문턱 미만인 동안은 점이 없다', () => {
    const t = accuracyTrends(many('b0', LEVEL_MIN_SEEN - 1, 0, '2026-10-01'), bandOf, TODAY)
    expect(t.get('all')).toBeUndefined()
  })

  it('최근 30회만 센다 — 오래된 오답은 창에서 밀려난다', () => {
    const events = [...many('b0', 0, 10, '2026-09-01'), ...many('b0', LEVEL_WINDOW, 0, '2026-10-08')]
    const last = accuracyTrends(events, bandOf, TODAY).get('all')!.at(-1)!
    expect(last.rate).toBe(1)
    expect(last.n).toBe(LEVEL_WINDOW)
  })

  it('코스 4·뜻 카드·삭제된 기록·출제 범위 밖은 세지 않는다', () => {
    const events = [
      ...many('b4', 0, 10, '2026-10-01'),
      ...many('b0', 5, 0, '2026-10-01'),
      ev('b0', false, '2026-10-01', { cardType: 'meaning' }),
      ev('b0', false, '2026-10-01', { deletedAt: 1 }),
      ev('zz', false, '2026-10-01'),
    ]
    const t = accuracyTrends(events, bandOf, TODAY).get('all')!
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ rate: 1, n: 5 })
    expect(accuracyTrends(events, bandOf, TODAY).has(4 as Band)).toBe(false)
  })

  it('전체는 코스를 합산하고, 코스 계열은 그 코스만 센다', () => {
    const events = [...many('b0', 5, 0, '2026-10-01'), ...many('b1', 0, 5, '2026-10-02')]
    const trends = accuracyTrends(events, bandOf, TODAY)
    expect(trends.get('all')!.at(-1)!.rate).toBeCloseTo(0.5)
    expect(trends.get(0)!.map((p) => p.rate)).toEqual([1])
    expect(trends.get(1)!.map((p) => p.rate)).toEqual([0])
  })

  it('최근 4주 밖의 날은 점으로 안 낸다 — 값에는 들어간다', () => {
    const events = [...many('b0', 5, 0, '2026-08-01'), ...many('b0', 0, 5, '2026-10-08')]
    const t = accuracyTrends(events, bandOf, TODAY).get('all')!
    expect(t.map((p) => p.date)).toEqual(['2026-10-08'])
    expect(t[0]!.rate).toBeCloseTo(0.5)
    // 4주의 첫날은 포함, 그 전날은 제외
    const edge = accuracyTrends(
      [...many('b0', 5, 0, '2026-09-12'), ...many('b0', 5, 0, '2026-09-11')],
      bandOf,
      TODAY,
    ).get('all')!
    expect(TREND_DAYS).toBe(28)
    expect(edge.map((p) => p.date)).toEqual(['2026-09-12'])
  })

  it('수준 표와 같은 값이다 — 코스별 마지막 점 = buildLevel 의 그 코스 정답률', () => {
    const events = [
      ...many('b0', 20, 4, '2026-09-20'),
      ...many('b0', 9, 3, '2026-10-05'),
      ...many('b1', 14, 7, '2026-10-06'),
      ...many('b2', 3, 4, '2026-10-08'),
    ]
    const trends = accuracyTrends(events, bandOf, TODAY)
    for (const row of buildLevel(events, bandOf).bands) {
      if (row.seen < LEVEL_MIN_SEEN || row.band > 3) continue
      expect(trends.get(row.band as Band)!.at(-1)!.rate).toBeCloseTo(row.rate)
    }
  })
})
