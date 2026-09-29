// 매일 학습 달력의 데이터 층 (2026-09-29)
import { describe, expect, it } from 'vitest'
import { buildAttendance, calendarGrid, type DayRecord } from './attendance.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

const T = { quick: 3, full: 20 }

let n = 0
/** `at`을 로컬 날짜·시각 구성요소로 직접 짓는다 — localDateKey가 로컬 getter로 읽으므로
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

describe('calendarGrid', () => {
  // 2026-09-29(오늘, 시스템 기준일)는 화요일이다 — 이번 주 토요일 10-03이 격자 끝,
  // 4주 전 일요일 09-06이 격자 시작이다.
  const today = new Date(2026, 8, 29, 15, 0)

  it('4주(28일)를 7일씩 묶어 낸다', () => {
    const weeks = calendarGrid(today, new Map())
    expect(weeks).toHaveLength(4)
    expect(weeks.every((w) => w.length === 7)).toBe(true)
  })

  it('시작은 일요일 09-06, 끝은 토요일 10-03이다', () => {
    const weeks = calendarGrid(today, new Map())
    expect(weeks[0][0].date).toBe('2026-09-06')
    expect(weeks[3][6].date).toBe('2026-10-03')
  })

  it('오늘 이후는 future, 오늘과 그 이전은 attendance를 따른다', () => {
    const attendance = new Map<string, DayRecord>([
      ['2026-09-29', { date: '2026-09-29', count: 20, tier: 'full' }],
    ])
    const weeks = calendarGrid(today, attendance)
    const flat = weeks.flat()
    const sep29 = flat.find((d) => d.date === '2026-09-29')
    const sep30 = flat.find((d) => d.date === '2026-09-30')
    const oct03 = flat.find((d) => d.date === '2026-10-03')
    expect(sep29?.state).toBe('full')
    expect(sep30?.state).toBe('future')
    expect(oct03?.state).toBe('future')
  })

  it('기록이 없는 과거 날짜는 none이다', () => {
    const weeks = calendarGrid(today, new Map())
    const sep10 = weeks.flat().find((d) => d.date === '2026-09-10')
    expect(sep10?.state).toBe('none')
  })
})
