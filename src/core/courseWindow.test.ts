// 코스별 판정 창 해부 — 창이 걸친 날, 전체 기간 값, 창 안 오답 유형·반복, Wilson 구간
import { describe, expect, it } from 'vitest'
import { courseWindows } from './courseWindow.ts'
import { buildLevel } from './level.ts'
import { wilson } from './wilson.ts'
import type { Band } from '../lib/bands.ts'
import type { MistakeType, ReviewEvent } from './types.ts'

const band: Record<string, Band> = { a: 0, b: 1, c: 2, z: 4 }
let n = 0
const ev = (idiomId: string, correct: boolean, day: string, mistakeType: MistakeType | null = null): ReviewEvent => ({
  id: `e${n++}`,
  userId: 'local',
  deviceId: 'd',
  at: new Date(`${day}T12:00:00`).getTime() + n,
  idiomId,
  cardType: 'reading',
  mistakeType,
  deletedAt: null,
  type: 'review',
  grade: correct ? 3 : 1,
  answer: '',
  expected: '',
  correct,
  elapsedMs: 1,
})
const run = (id: string, c: number, w: number, day: string, t: MistakeType | null = null) => [
  ...Array.from({ length: c }, () => ev(id, true, day)),
  ...Array.from({ length: w }, () => ev(id, false, day, t)),
]
const bandOf = (id: string) => band[id.slice(0, 1)]
const typeOf = (e: { mistakeType: MistakeType | null }) => e.mistakeType

describe('courseWindows', () => {
  it('판정 창이 하루에 몰렸으면 days 가 1이고, 전체 기간 값은 따로 센다', () => {
    // 옛날 90회 중 81 정답(90%) → 오늘 120회 중 96 정답(80%). 7일 창은 오늘 120회뿐이다
    const events = [...run('a', 81, 9, '2026-09-10'), ...run('a', 96, 24, '2026-10-09')]
    const w = courseWindows(events, bandOf, typeOf).get(0)!
    expect(w).toMatchObject({ n: 120, correct: 96, days: 1, firstDate: '2026-10-09', lastDate: '2026-10-09' })
    expect(w.allN).toBe(210)
    expect(w.allCorrect).toBe(177)
  })

  it('창이 여러 날에 걸치면 그 날 수를 센다', () => {
    const events = [...run('a', 40, 0, '2026-10-05'), ...run('a', 40, 0, '2026-10-07'), ...run('a', 40, 0, '2026-10-09')]
    const w = courseWindows(events, bandOf, typeOf).get(0)!
    expect(w.n).toBe(120)
    expect(w.days).toBe(3)
    expect(w.firstDate).toBe('2026-10-05')
  })

  it('7일 안이 100회에 못 미치면 최근 100회까지 넓힌다', () => {
    const events = [...run('a', 60, 0, '2026-09-01'), ...run('a', 50, 0, '2026-10-09')]
    const w = courseWindows(events, bandOf, typeOf).get(0)!
    expect(w.n).toBe(100)
    expect(w.firstDate).toBe('2026-09-01')
  })

  it('창 안 오답을 유형별로 세고, 두 번 이상 틀린 숙어를 낸다', () => {
    const events = [
      ...run('a', 120, 0, '2026-10-09'),
      ev('a', false, '2026-10-09', 'CHOON'),
      ev('a', false, '2026-10-09', 'CHOON'),
      ev('b', false, '2026-10-09', 'CHOON'), // 다른 코스 — 세지 않는다
      ev('a', false, '2026-10-09', 'RENDAKU'),
    ]
    const w = courseWindows(events, bandOf, typeOf).get(0)!
    expect(w.wrongN).toBe(3)
    expect(w.wrongTypes).toEqual([
      { type: 'CHOON', count: 2 },
      { type: 'RENDAKU', count: 1 },
    ])
    expect(w.repeated).toEqual([{ idiomId: 'a', count: 3 }])
  })

  it('코스 4·뜻 카드·삭제된 기록은 뺀다', () => {
    const events = [
      ...run('z', 5, 5, '2026-10-09'),
      { ...ev('a', false, '2026-10-09'), cardType: 'meaning' } as ReviewEvent,
      { ...ev('a', false, '2026-10-09'), deletedAt: 1 },
    ]
    const out = courseWindows(events, bandOf, typeOf)
    expect(out.size).toBe(0)
  })

  it('창의 채점·정답 수와 오차 구간은 수준 표(buildLevel)와 같다', () => {
    const events = [...run('a', 90, 30, '2026-10-01'), ...run('a', 50, 30, '2026-10-09'), ...run('b', 70, 30, '2026-10-08')]
    const windows = courseWindows(events, bandOf, typeOf)
    for (const row of buildLevel(events, bandOf).bands) {
      const w = windows.get(row.band as Band)
      if (!w) continue
      expect(w.n).toBe(row.seen)
      expect(w.correct).toBe(row.correct)
      expect(w.ci).toEqual(row.ci)
    }
  })
})

describe('wilson', () => {
  it('30회 중 22개(73%)는 안정 기준 80% 를 구간 안에 둔다', () => {
    const [lo, hi] = wilson(22, 30)
    expect(lo).toBeLessThan(0.8)
    expect(hi).toBeGreaterThan(0.8)
    expect(lo).toBeGreaterThan(0.5)
  })
  it('표본이 커지면 구간이 좁아지고, 표본이 없으면 전체 구간이다', () => {
    const small = wilson(22, 30)
    const big = wilson(220, 300)
    expect(big[1] - big[0]).toBeLessThan(small[1] - small[0])
    expect(wilson(0, 0)).toEqual([0, 1])
  })
})
