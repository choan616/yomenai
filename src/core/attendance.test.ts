// 매일 학습 달력의 데이터 층 (2026-09-29)
import { describe, expect, it } from 'vitest'
import { buildAttendance, monthGrid, type DayRecord } from './attendance.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

const T = { quick: 3, full: 20 }

let n = 0
/** `at`을 로컬 날짜·시각 구성요소로 직접 짓는다 — dateKey가 로컬 getter로 읽으므로
 *  실행 환경의 시간대와 무관하게 같은 날짜로 떨어진다 */
function ev(y: number, m: number, d: number, overrides: Partial<ReviewEvent> = {}): ReviewEvent {
  return {
    id: `e${n++}`,
    userId: 'local',
    deviceId: 'dev',
    at: new Date(y, m - 1, d, 12).getTime(),
    idiomId: 'i',
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: 3,
    answer: '',
    expected: '',
    correct: true,
    elapsedMs: 1,
    ...overrides,
  }
}

function repeat(y: number, m: number, d: number, count: number): LearningEvent[] {
  return Array.from({ length: count }, () => ev(y, m, d))
}

describe('buildAttendance', () => {
  it('기록이 없으면 빈 맵이다', () => {
    expect(buildAttendance([], T).size).toBe(0)
  })

  it('문턱(quick) 미만인 날은 count는 쌓이되 tier는 none', () => {
    const map = buildAttendance(repeat(2026, 9, 10, 2), T)
    expect(map.get('2026-09-10')).toEqual({ date: '2026-09-10', count: 2, tier: 'none' })
  })

  it('quick 이상 full 미만이면 touched', () => {
    const map = buildAttendance(repeat(2026, 9, 10, T.quick), T)
    expect(map.get('2026-09-10')?.tier).toBe('touched')
    const map2 = buildAttendance(repeat(2026, 9, 10, T.full - 1), T)
    expect(map2.get('2026-09-10')?.tier).toBe('touched')
  })

  it('full 이상이면 full', () => {
    const map = buildAttendance(repeat(2026, 9, 10, T.full), T)
    expect(map.get('2026-09-10')?.tier).toBe('full')
  })

  it('소프트 삭제된 이벤트는 안 센다', () => {
    const events = repeat(2026, 9, 10, T.quick).map((e) => ({ ...e, deletedAt: Date.now() }))
    expect(buildAttendance(events, T).size).toBe(0)
  })

  it('review가 아닌 이벤트는 안 센다', () => {
    const meaningKnown: LearningEvent = {
      id: 'm1', userId: 'local', deviceId: 'dev', at: new Date(2026, 8, 10, 12).getTime(),
      idiomId: 'i', cardType: 'meaning', mistakeType: null, deletedAt: null,
      type: 'meaningKnown', known: true,
    }
    expect(buildAttendance([meaningKnown], T).size).toBe(0)
  })

  it('날짜가 다르면 따로 집계한다', () => {
    const map = buildAttendance([...repeat(2026, 9, 10, 5), ...repeat(2026, 9, 11, 1)], T)
    expect(map.get('2026-09-10')?.count).toBe(5)
    expect(map.get('2026-09-11')?.count).toBe(1)
  })
})

describe('monthGrid', () => {
  // 2026-09-01은 화요일이다(사용자가 준 참고 이미지와 일치 — 일·월이 빈 칸, 1이 화 밑).
  // 9월은 30일이라 앞 2칸 + 30일 = 32칸, 7의 배수로 올리면 35칸(5주) — 뒤 3칸이 빈 칸이다.

  it('앞은 달 밖이라 null, 1일부터 실제 칸이 시작된다', () => {
    const weeks = monthGrid(2026, 9, new Map())
    expect(weeks[0][0]).toBeNull()
    expect(weeks[0][1]).toBeNull()
    expect(weeks[0][2]).toEqual({ date: '2026-09-01', day: 1, tier: 'none' })
  })

  it('주 단위(7칸)로 묶고, 이번 달 날수만큼 실제 칸을 낸다', () => {
    const weeks = monthGrid(2026, 9, new Map())
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    const real = weeks.flat().filter((c) => c !== null)
    expect(real).toHaveLength(30)
    expect(real[0]!.date).toBe('2026-09-01')
    expect(real[29]!.date).toBe('2026-09-30')
  })

  it('달 끝 뒤의 남는 칸도 null이다', () => {
    const weeks = monthGrid(2026, 9, new Map())
    const last = weeks[weeks.length - 1]
    // 30일이 5번째 주의 4번째 칸(수요일) — 그 뒤 사흘은 10월이라 null
    expect(last.filter((c) => c === null)).toHaveLength(3)
  })

  it('attendance에 있는 날짜는 그 등급을, 없는 날짜는 none을 낸다', () => {
    const attendance = new Map<string, DayRecord>([
      ['2026-09-10', { date: '2026-09-10', count: 3, tier: 'touched' }],
      ['2026-09-15', { date: '2026-09-15', count: 25, tier: 'full' }],
    ])
    const flat = monthGrid(2026, 9, attendance).flat()
    expect(flat.find((c) => c?.date === '2026-09-10')?.tier).toBe('touched')
    expect(flat.find((c) => c?.date === '2026-09-15')?.tier).toBe('full')
    expect(flat.find((c) => c?.date === '2026-09-11')?.tier).toBe('none')
  })

  it('일수가 다른 달·요일이 다르게 시작하는 달도 맞게 짠다 (2월, 일요일 시작)', () => {
    // 2026-02-01은 일요일이라 앞에 빈 칸이 없다
    const weeks = monthGrid(2026, 2, new Map())
    expect(weeks[0][0]).toEqual({ date: '2026-02-01', day: 1, tier: 'none' })
    const real = weeks.flat().filter((c) => c !== null)
    expect(real).toHaveLength(28)
    expect(real[27]!.date).toBe('2026-02-28')
  })
})
