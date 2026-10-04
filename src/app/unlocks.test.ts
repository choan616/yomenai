// 기능 잠금 — 최장 연속이 기준에 닿으면 열리고, 한 번 열리면 끊겨도 열려 있다
import { describe, expect, it } from 'vitest'
import { buildStreak } from '../core/streak.ts'
import type { DayRecord } from '../core/attendance.ts'
import { shiftDateKey } from '../core/attendance.ts'
import { isUnlocked, SHIRITORI_STREAK_DAYS } from './unlocks.ts'

describe('isUnlocked', () => {
  it('기록 계산 전(null)에는 잠겨 있다', () => {
    expect(isUnlocked('shiritori', null)).toBe(false)
  })

  it('최장 연속이 기준 전이면 잠겨 있고, 닿으면 열린다', () => {
    expect(isUnlocked('shiritori', { longest: SHIRITORI_STREAK_DAYS - 1 })).toBe(false)
    expect(isUnlocked('shiritori', { longest: SHIRITORI_STREAK_DAYS })).toBe(true)
    expect(isUnlocked('shiritori', { longest: SHIRITORI_STREAK_DAYS + 10 })).toBe(true)
  })

  it('기준은 이정표 사다리의 4주(28일)다', () => {
    expect(SHIRITORI_STREAK_DAYS).toBe(28)
  })
})

describe('실제 연속 기록과 이어서', () => {
  const day = (date: string): DayRecord => ({ date, count: 3, correct: 3, tier: 'touched' })
  const run = (start: string, n: number): Map<string, DayRecord> => {
    const m = new Map<string, DayRecord>()
    for (let i = 0; i < n; i++) {
      const d = shiftDateKey(start, i)
      m.set(d, day(d))
    }
    return m
  }

  it('28일을 이으면 열리고, 그 뒤 끊겨서 현재 연속이 0 이어도 열려 있다', () => {
    const att = run('2026-08-01', 28) // 8/1 ~ 8/28
    const today = '2026-10-04' // 한참 뒤 — 현재 연속은 0
    const s = buildStreak(att, today)
    expect(s.current).toBe(0)
    expect(s.longest).toBe(28)
    expect(isUnlocked('shiritori', s)).toBe(true)
  })

  it('27일에서 끊기면 잠겨 있다', () => {
    const att = run('2026-08-01', 27)
    expect(isUnlocked('shiritori', buildStreak(att, '2026-08-27'))).toBe(false)
  })

  it('하루 빠지면 연속이 갈라져 두 토막 합이 아니라 긴 토막으로 본다', () => {
    const att = run('2026-08-01', 20)
    for (const [k, v] of run('2026-08-22', 20)) att.set(k, v)
    expect(isUnlocked('shiritori', buildStreak(att, '2026-09-10'))).toBe(false)
  })
})
