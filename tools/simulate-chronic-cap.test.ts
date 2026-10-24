// 상습 표현 몫 상한 시뮬레이션의 순수 함수 검증 — KST 날짜, 미래 정보 없는 상습 판정, FIFO 이월, 간격 분포
import { describe, expect, it } from 'vitest'
import {
  dailyRows,
  kstDay,
  reviewIntervals,
  shareByVolume,
  simulateCap,
  type DayRow,
} from './simulate-chronic-cap.ts'
import type { ReviewEvent } from '../src/core/types.ts'

const DAY = 864e5
/** KST 기준 day 번째 날의 정오 (UTC 03:00) */
const noon = (day: number) => day * DAY + 3 * 36e5
let seq = 0
function ev(idiomId: string, at: number, correct: boolean): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at,
    idiomId,
    cardType: 'reading',
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

function row(day: number, total: number, chronic: number): DayRow {
  return { day, total, chronic, chronicOk: 0, restOk: 0, chronicSet: 0 }
}

describe('kstDay', () => {
  it('UTC 14:59 는 같은 날, 15:00 은 다음 날(KST 자정)', () => {
    const base = 100 * DAY // UTC 00:00
    expect(kstDay(base + 14 * 36e5 + 59 * 6e4)).toBe(100)
    expect(kstDay(base + 15 * 36e5)).toBe(101)
  })
})

describe('dailyRows', () => {
  it('상습은 그 날 이전 누적 오답으로만 판정한다 (같은 날 3번째 오답은 다음 날부터)', () => {
    const rows = dailyRows([
      ev('a', noon(10), false), ev('a', noon(10) + 1, false), ev('a', noon(10) + 2, false),
      ev('a', noon(10) + 3, true), // 같은 날: 아직 상습 아님
      ev('a', noon(11), true), // 다음 날: 상습
      ev('b', noon(11), true),
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ total: 4, chronic: 0, chronicSet: 0 })
    expect(rows[1]).toMatchObject({ total: 2, chronic: 1, chronicOk: 1, restOk: 1, chronicSet: 1 })
  })

  it('삭제된 이벤트와 뜻 카드는 세지 않는다', () => {
    const deleted = { ...ev('a', noon(10), true), deletedAt: 5 }
    const meaning = { ...ev('a', noon(10), true), cardType: 'meaning' as const }
    expect(dailyRows([deleted, meaning])).toEqual([])
  })
})

describe('simulateCap', () => {
  const rows = [row(1, 100, 60), row(2, 100, 60), row(3, 100, 60)]

  it('상한이 없으면 적체도 지연도 없다', () => {
    const r = simulateCap(rows, null)
    expect(r.backlog.map((b) => b.n)).toEqual([0, 0, 0])
    expect(r.served).toBe(180)
    expect(r.delaySum).toBe(0)
  })

  it('상한 1/2: 하루 10건씩 이월되어 쌓이고 FIFO 로 지연이 늘어난다', () => {
    const r = simulateCap(rows, 1 / 2)
    expect(r.backlog.map((b) => b.n)).toEqual([10, 20, 30])
    // 1일: 50 처리·10 이월. 2일: 이월 10(지연 1)+40 처리. 3일: 이월 20(지연 1)+30 처리
    expect(r.served).toBe(150)
    expect(r.leftover).toBe(30)
  })

  it('수요가 용량 이하면 적체가 다음 날 비워진다', () => {
    const r = simulateCap([row(1, 100, 60), row(2, 100, 20), row(3, 100, 20)], 1 / 2)
    expect(r.backlog.map((b) => b.n)).toEqual([10, 0, 0])
    expect(r.delaySum).toBe(10) // 1일에 밀린 10건이 하루 늦게 서비스됨
  })

  it('창 정답률 추정은 상습 몫이 줄면 나머지 정답률 쪽으로 움직인다', () => {
    // 직전 기록으로 상습 정답률 0%, 나머지 100% 를 만들어 둔다
    const hist: DayRow = { day: 1, total: 100, chronic: 50, chronicOk: 0, restOk: 50, chronicSet: 0 }
    const days = [hist, row(2, 100, 50)]
    const none = simulateCap(days, null)
    const quarter = simulateCap(days, 1 / 4)
    // 표본이 모자라 누적 비율(상습 0, 나머지 1)을 쓴다 → 2일 기대 정답: 없음 50, 1/4 상한 75
    expect(none.windowExpectedOk).toBe(50 + 0)
    expect(quarter.windowExpectedOk).toBe(75 + 0)
  })
})

describe('reviewIntervals', () => {
  it('앞 채점 직후 누적 오답 3회+ 인 표현의 간격만 상습으로 센다', () => {
    const events = [
      ev('a', noon(1), false), ev('a', noon(1) + 1, false), ev('a', noon(2), false), // 3번째 오답 직후부터 상습
      ev('a', noon(2) + 1, true), // 같은 날(간격 0), 앞 채점 직후 상습
      ev('a', noon(5), true), // 간격 3
    ]
    const c = reviewIntervals(events, true)
    expect(c.n).toBe(2)
    expect(c.buckets[0]).toBe(1)
    expect(c.buckets[3]).toBe(1)
    const rest = reviewIntervals(events, false)
    expect(rest.n).toBe(2) // 오답 1·2 직후의 간격(0, 1)
  })
})

describe('shareByVolume', () => {
  it('학습량 하위/상위 1/3 날의 상습 몫을 풀링한다', () => {
    const rows: DayRow[] = [
      { ...row(1, 10, 5), chronicSet: 1 },
      { ...row(2, 20, 6), chronicSet: 1 },
      { ...row(3, 30, 6), chronicSet: 1 },
      { ...row(4, 100, 20), chronicSet: 1 },
      { ...row(5, 200, 40), chronicSet: 1 },
      { ...row(6, 300, 60), chronicSet: 1 },
    ]
    const s = shareByVolume(rows, 1)!
    expect(s.low).toMatchObject({ days: 2, minTotal: 10, maxTotal: 20, share: 11 / 30 })
    expect(s.high).toMatchObject({ days: 2, minTotal: 200, maxTotal: 300, share: 100 / 500 })
    expect(shareByVolume(rows, 5)).toBeNull()
  })
})
