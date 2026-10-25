// S1 시뮬레이션의 순수 함수 검증 — R 식 일치, 접기=replay, P0=selectSession, 정책 순서, 보정 물러남, 소진 모의
import { fsrs } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { replay } from '../src/core/replay.ts'
import { FSRS_PARAMS } from '../src/core/scheduler.ts'
import { cardKey, type ReviewEvent } from '../src/core/types.ts'
import {
  BUCKETS,
  DAY_MS,
  MIN_BUCKET_N,
  SESSION,
  bucketOf,
  buildCalibration,
  calibrated,
  duePool,
  elapsedClass,
  endOfKstDay,
  evalCell,
  foldObservations,
  kstDay,
  pick,
  retrievability,
  runBacklog,
  selectSessionKeys,
  type Obs,
} from './simulate-return.ts'

/** KST 기준 day 번째 날의 정오 (UTC 03:00) */
const noon = (day: number) => day * DAY_MS + 3 * 36e5
let seq = 0
function ev(
  idiomId: string,
  at: number,
  correct: boolean,
  cardType: 'reading' | 'meaning' = 'reading',
): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(6, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at,
    idiomId,
    cardType,
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: correct ? 3 : 1,
    answer: 'x',
    expected: 'x',
    correct,
    elapsedMs: 1000,
  }
}

/** 숙어 n 개 — 첫 복습 날이 제각각이고 절반은 두 번째 복습이 있어 안정도·기한이 갈린다 */
function events(n: number): ReviewEvent[] {
  const out: ReviewEvent[] = []
  for (let i = 0; i < n; i++) {
    const id = `i${String(i).padStart(3, '0')}`
    out.push(ev(id, noon(1 + (i % 9)), true))
    if (i % 2 === 0) out.push(ev(id, noon(12 + (i % 5)), i % 4 !== 0))
  }
  return out
}

const NOW = noon(60)

describe('날짜', () => {
  it('endOfKstDay 는 그 KST 날의 마지막 ms 다', () => {
    expect(kstDay(endOfKstDay(100))).toBe(100)
    expect(kstDay(endOfKstDay(100) + 1)).toBe(101)
  })
})

describe('retrievability', () => {
  it('ts-fsrs 의 get_retrievability 와 같은 값을 낸다', () => {
    const state = replay(events(30))
    const svc = fsrs(FSRS_PARAMS)
    for (const st of state.cards.values()) {
      for (const now of [NOW, NOW + 7 * DAY_MS, st.card.due.getTime()]) {
        expect(retrievability(st.card, now)).toBeCloseTo(svc.get_retrievability(st.card, new Date(now), false), 12)
      }
    }
  })
})

describe('foldObservations', () => {
  it('마지막 카드 상태가 replay 와 같고, 첫 복습은 관측에서 빠진다', () => {
    const evs = events(30)
    const { obs, cards } = foldObservations(evs)
    const state = replay(evs)
    expect(cards.size).toBe(state.cards.size)
    for (const [key, st] of state.cards) {
      expect(cards.get(key)!.due.getTime()).toBe(st.card.due.getTime())
      expect(cards.get(key)!.stability).toBe(st.card.stability)
    }
    expect(obs).toHaveLength(evs.length - state.cards.size)
    expect(obs.every((o) => o.r >= 0 && o.r <= 1)).toBe(true)
  })

  it('삭제된 이벤트는 접지 않는다', () => {
    const e = { ...ev('a', noon(1), true), deletedAt: 5 }
    expect(foldObservations([e]).cards.size).toBe(0)
  })
})

describe('정책', () => {
  const state = replay(events(60))
  const pool = duePool(state, NOW)

  it('풀은 기한 지난 카드만이고 기본은 읽기 카드뿐이다', () => {
    expect(pool.length).toBe(60)
    expect(pool.every((c) => c.overdue >= 0 && c.cardType === 'reading')).toBe(true)
    const withMeaning = replay([...events(5), ev('i000', noon(2), true, 'meaning')])
    expect(duePool(withMeaning, NOW)).toHaveLength(5)
    expect(duePool(withMeaning, NOW, true)).toHaveLength(6)
  })

  it('P0 는 selectSession 이 뽑는 카드와 같은 집합이다', () => {
    const mine = new Set(pick(pool, SESSION, 'overdue').map((c) => cardKey(c.idiomId, c.cardType)))
    expect(mine).toEqual(selectSessionKeys(state, NOW, SESSION))
  })

  it('P0 는 초과 큰 순, P1 은 R 높은 순이다', () => {
    const p0 = pick(pool, 30, 'overdue')
    const p1 = pick(pool, 30, 'retrievability')
    for (let i = 1; i < p0.length; i++) expect(p0[i - 1]!.overdue).toBeGreaterThanOrEqual(p0[i]!.overdue)
    for (let i = 1; i < p1.length; i++) expect(p1[i - 1]!.r).toBeGreaterThanOrEqual(p1[i]!.r)
    const mean = (xs: { r: number }[]) => xs.reduce((s, x) => s + x.r, 0) / xs.length
    expect(mean(pick(pool, SESSION, 'retrievability'))).toBeGreaterThanOrEqual(mean(pick(pool, SESSION, 'overdue')))
  })

  it('풀을 건드리지 않는다', () => {
    const before = pool.map((c) => c.idiomId).join()
    pick(pool, 5, 'retrievability')
    expect(pool.map((c) => c.idiomId).join()).toBe(before)
  })
})

describe('캘리브레이션', () => {
  const obs = (r: number, elapsed: number, correct: boolean, n: number): Obs[] =>
    Array.from({ length: n }, (_, i) => ({ key: `k${i}`, cardType: 'reading', at: i, r, elapsed, correct: correct && i % 4 !== 0 }))

  it('bucketOf 는 0~1 을 BUCKETS 칸으로, 1.0 은 마지막 칸에 넣는다', () => {
    expect(bucketOf(0)).toBe(0)
    expect(bucketOf(0.55)).toBe(5)
    expect(bucketOf(1)).toBe(BUCKETS - 1)
  })

  it('elapsedClass: 0 / 1~2 / 3+', () => {
    expect([0, 1, 2, 3, 10].map(elapsedClass)).toEqual([0, 1, 1, 2, 2])
  })

  it('표본이 충분하면 그 칸의 실제 정답률을 쓴다 (75%)', () => {
    const cal = buildCalibration(obs(0.85, 5, true, MIN_BUCKET_N * 2))
    expect(calibrated(cal, 0.85, 5)).toBeCloseTo(0.75, 2)
  })

  it('표본이 모자라면 경과 1일+ 표 → 예측 R 순으로 물러난다', () => {
    const cal = buildCalibration([...obs(0.85, 1, true, MIN_BUCKET_N * 2), ...obs(0.85, 5, true, 3)])
    // 경과 3일+ 칸은 3건이라 모자란다 → 경과 1일+ 표(1일 63건 + 3일 3건)
    const late = calibrated(cal, 0.85, 5)
    expect(late).not.toBeCloseTo(0.85, 2)
    expect(calibrated(buildCalibration([]), 0.42, 5)).toBe(0.42)
  })
})

describe('소진 모의', () => {
  const state = replay(events(60))
  const pool = duePool(state, NOW)

  it('모든 카드가 한 번씩 처리되고 세션 수는 ceil(B/20) 이다', () => {
    for (const first of ['overdue', 'retrievability'] as const) {
      const run = runBacklog(pool, NOW, first)
      expect(run.sessions).toBe(Math.ceil(pool.length / SESSION))
      expect(run.sessionOf.every((k) => k >= 0)).toBe(true)
      for (let k = 0; k < run.sessions; k++) {
        expect(run.sessionOf.filter((x) => x === k).length).toBeLessThanOrEqual(SESSION)
      }
    }
  })

  it('P0 소진은 초과 큰 순으로 세션에 들어간다', () => {
    const run = runBacklog(pool, NOW, 'overdue')
    const order = pick(pool, pool.length, 'overdue')
    let last = 0
    for (const c of order) {
      const k = run.sessionOf[pool.indexOf(c)]!
      expect(k).toBeGreaterThanOrEqual(last)
      last = k
    }
  })

  it('하루 세션 수가 많으면 같은 날에 여러 세션이 들어간다', () => {
    const run = runBacklog(pool, NOW, 'overdue', 3)
    expect(Math.max(...run.dayOf)).toBe(Math.ceil(run.sessions / 3) - 1)
  })

  it('P1 첫 세션이 일으키는 추가 지연은 한 세션 몫(1일)을 넘지 않는다', () => {
    const cal = buildCalibration([])
    const cell = evalCell(pool, NOW, cal, cal)
    expect(cell.b).toBe(pool.length)
    expect(cell.back[1]!.extraMax).toBeLessThanOrEqual(1)
    expect(cell.back[1]!.extraTop).toBe(1)
    expect(cell.first.retrievability.raw).toBeGreaterThanOrEqual(cell.first.overdue.raw)
  })

  it('풀이 비어 있으면 NaN 점수와 0 지연을 낸다', () => {
    const cal = buildCalibration([])
    const cell = evalCell([], NOW, cal, cal)
    expect(cell.b).toBe(0)
    expect(cell.first.overdue.raw).toBeNaN()
    expect(cell.back[1]!.extraMax).toBe(0)
  })
})
