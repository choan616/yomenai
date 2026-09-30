// 연속 학습 기록 — 현재·최장·이정표 (2026-09-30)
import { describe, expect, it } from 'vitest'
import { shiftDateKey, type DayRecord } from './attendance.ts'
import { buildStreak, milestoneLabel, nextMilestone } from './streak.ts'

/** `from` 부터 `n`일 연속 touched 인 날들 */
function run(from: string, n: number, tier: DayRecord['tier'] = 'touched'): [string, DayRecord][] {
  return Array.from({ length: n }, (_, i) => {
    const date = shiftDateKey(from, i)
    return [date, { date, count: 5, correct: 5, tier }]
  })
}

describe('buildStreak', () => {
  it('기록이 없으면 전부 0', () => {
    expect(buildStreak(new Map(), '2026-09-30')).toEqual({
      current: 0,
      todayDone: false,
      longest: 0,
      milestones: [],
    })
  })

  it('오늘까지 이어졌으면 오늘 포함 길이', () => {
    const s = buildStreak(new Map(run('2026-09-26', 5)), '2026-09-30')
    expect(s).toMatchObject({ current: 5, todayDone: true, longest: 5 })
  })

  it('오늘 아직 안 했으면 어제까지의 연속이 살아 있다', () => {
    const s = buildStreak(new Map(run('2026-09-26', 4)), '2026-09-30')
    expect(s).toMatchObject({ current: 4, todayDone: false })
  })

  it('어제도 안 했으면 current 0 — 최장은 남는다', () => {
    const s = buildStreak(new Map(run('2026-09-20', 6)), '2026-09-30')
    expect(s).toMatchObject({ current: 0, longest: 6 })
  })

  it('문턱 미만(none)인 날은 연속을 잇지 않는다', () => {
    const days = new Map([
      ...run('2026-09-27', 2),
      ...run('2026-09-29', 1, 'none'),
      ...run('2026-09-30', 1),
    ])
    expect(buildStreak(days, '2026-09-30')).toMatchObject({ current: 1, longest: 2 })
  })

  it('full 도 연속을 잇는다', () => {
    const days = new Map([...run('2026-09-28', 2, 'full'), ...run('2026-09-30', 1)])
    expect(buildStreak(days, '2026-09-30').current).toBe(3)
  })

  it('7·14일에 이정표 — 달성일과 안정 id', () => {
    const s = buildStreak(new Map(run('2026-09-01', 15)), '2026-09-15')
    expect(s.milestones).toEqual([
      { id: 'streak7:2026-09-07', days: 7, date: '2026-09-07' },
      { id: 'streak14:2026-09-14', days: 14, date: '2026-09-14' },
    ])
  })

  it('끊긴 뒤 다시 채우면 같은 이정표가 또 들어간다 — 앞의 달성은 안 사라진다', () => {
    const days = new Map([...run('2026-08-01', 7), ...run('2026-08-10', 7)])
    const s = buildStreak(days, '2026-08-20')
    expect(s.milestones.map((m) => m.id)).toEqual(['streak7:2026-08-07', 'streak7:2026-08-16'])
  })

  it('달 경계를 넘어도 이어진다', () => {
    const s = buildStreak(new Map(run('2026-09-28', 5)), '2026-10-02')
    expect(s.current).toBe(5)
  })

  it('오늘 뒤 날짜(시계가 틀린 다른 기기 기록)는 세지 않는다', () => {
    const s = buildStreak(new Map(run('2026-09-30', 3)), '2026-09-30')
    expect(s).toMatchObject({ current: 1, longest: 1 })
  })
})

describe('milestoneLabel · nextMilestone', () => {
  it('주 단위 이름', () => {
    expect(milestoneLabel(7)).toBe('1주 연속')
    expect(milestoneLabel(28)).toBe('4주 연속')
  })
  it('다음 이정표 — 끝을 넘으면 null', () => {
    expect(nextMilestone(0)).toBe(7)
    expect(nextMilestone(7)).toBe(14)
    expect(nextMilestone(84)).toBe(null)
  })
})
