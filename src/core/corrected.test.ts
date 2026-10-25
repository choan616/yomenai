// 「바로잡은 표현」 판정 검증 — 상습 전 제외, 7일 경계, 연속 끊김, 한 번 세면 유지, 미래 정보 금지, 삭제·뜻 카드·중복 제외
import { describe, expect, it } from 'vitest'
import { correctedIds, correctedIndex, correctedSummary, readingReviews } from './corrected.ts'
import type { ReviewEvent } from './types.ts'

const DAY = 864e5
const HOUR = 36e5
const T0 = Date.UTC(2026, 8, 1)

let seq = 0
function ev(idiomId: string, at: number, correct: boolean, over: Partial<ReviewEvent> = {}): ReviewEvent {
  seq++
  return {
    id: `c${String(seq).padStart(6, '0')}`,
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
    ...over,
  }
}

/** 오답 3회(0·1·2일)로 상습이 된 뒤 이어지는 기록. rest = [시각(ms), 정답 여부][] */
function chronicThen(id: string, rest: [number, boolean][]): ReviewEvent[] {
  return [
    ev(id, T0, false),
    ev(id, T0 + DAY, false),
    ev(id, T0 + 2 * DAY, false),
    ...rest.map(([at, ok]) => ev(id, at, ok)),
  ]
}
const d = (days: number, hours = 0): number => T0 + days * DAY + hours * HOUR

describe('correctedIds', () => {
  it('상습이 되기 전의 연속 정답은 안 센다', () => {
    const list = [ev('a', d(0), false), ev('a', d(1), false), ev('a', d(10), true), ev('a', d(20), true)]
    expect(correctedIds(list).size).toBe(0)
  })

  it('연속 정답 하나로는 안 센다 — 7일이 지났어도 2회째가 있어야 한다', () => {
    expect(correctedIds(chronicThen('a', [[d(20), true]])).size).toBe(0)
  })

  it('첫 정답에서 7일이면 센다, 6일 23시간이면 안 센다', () => {
    expect(correctedIds(chronicThen('a', [[d(3), true], [d(10), true]])).has('a')).toBe(true)
    expect(correctedIds(chronicThen('c', [[d(3), true], [d(9, 23), true]])).size).toBe(0)
    expect(correctedIds(chronicThen('d', [[d(3), true], [d(10), true]])).has('d')).toBe(true)
  })

  it('연속 사이에 정답이 더 있어도 첫 정답이 기준이다', () => {
    const list = chronicThen('a', [[d(3), true], [d(5), true], [d(9, 23), true], [d(10), true]])
    expect(correctedIndex(readingReviews(list))).toBe(6)
  })

  it('연속이 오답으로 끊기면 다시 시작한다', () => {
    // 3일 정답 → 8일 오답(끊김) → 10일 정답 → 17일 정답: 첫 정답은 10일이라 7일 뒤인 17일에 바로잡힌다
    const broken = chronicThen('a', [[d(3), true], [d(8), false], [d(10), true], [d(16, 23), true]])
    expect(correctedIds(broken).size).toBe(0)
    expect(correctedIds([...broken, ev('a', d(17), true)]).has('a')).toBe(true)
    // 끊기지 않았다면 3일 첫 정답 기준으로 10일에 이미 바로잡혔을 기록이다
    expect(correctedIds(chronicThen('b', [[d(3), true], [d(10), true]])).has('b')).toBe(true)
  })

  it('한 번 센 뒤 오답이 와도 줄지 않는다', () => {
    const list = [...chronicThen('a', [[d(3), true], [d(10), true]]), ev('a', d(11), false), ev('a', d(12), false)]
    expect(correctedIds(list)).toEqual(new Set(['a']))
  })

  it('미래 정보를 쓰지 않는다 — 나중에 상습이 될 표현의 초기 연속 정답은 안 센다', () => {
    const list = [
      ev('a', d(0), true), // 이 시점엔 오답 0회
      ev('a', d(8), true), // 연속 2회·8일이지만 상습이 아니다
      ev('a', d(9), false),
      ev('a', d(10), false),
      ev('a', d(11), false), // 이제 상습
    ]
    expect(correctedIds(list).size).toBe(0)
  })

  it('삭제한 이벤트·뜻 카드·같은 id 중복은 무시한다', () => {
    const base = chronicThen('a', [[d(3), true]])
    const last = ev('a', d(10), true)
    expect(correctedIds([...base, { ...last, deletedAt: 5 }]).size).toBe(0)
    expect(correctedIds([...base, { ...last, cardType: 'meaning' }]).size).toBe(0)
    expect(correctedIds([...base, last, last]).has('a')).toBe(true)
    // 삭제된 오답은 상습을 만들지 않는다
    const withDeletedWrong = [
      ev('b', d(0), false), ev('b', d(1), false), ev('b', d(2), false, { deletedAt: 9 }),
      ev('b', d(3), true), ev('b', d(10), true),
    ]
    expect(correctedIds(withDeletedWrong).size).toBe(0)
  })

  it('표현마다 따로 센다', () => {
    const list = [
      ...chronicThen('a', [[d(3), true], [d(10), true]]),
      ...chronicThen('b', [[d(3), true], [d(9), true]]),
    ]
    expect(correctedIds(list)).toEqual(new Set(['a']))
  })

  it('입력 순서와 상관없이 시간순으로 판정한다', () => {
    const list = chronicThen('a', [[d(3), true], [d(10), true]])
    expect(correctedIds([...list].reverse()).has('a')).toBe(true)
  })
})

describe('correctedSummary', () => {
  it('이번 세션 이벤트로 새로 바로잡은 수만 gained 로 센다', () => {
    const before = [
      ...chronicThen('old', [[d(3), true], [d(10), true]]), // 이미 바로잡음
      ...chronicThen('new', [[d(3), true]]), // 하나 모자람
    ]
    const session = [ev('new', d(11), true), ev('old', d(11), false)]
    expect(correctedSummary(before, [...before, ...session])).toEqual({ total: 2, gained: 1 })
  })

  it('세션 이벤트가 없으면 gained 는 0 이고 total 은 그대로다', () => {
    const before = chronicThen('a', [[d(3), true], [d(10), true]])
    expect(correctedSummary(before, before)).toEqual({ total: 1, gained: 0 })
  })

  it('기록이 없으면 0 / 0', () => {
    expect(correctedSummary([], [])).toEqual({ total: 0, gained: 0 })
  })

  it('세션에서 틀려도 total 이 줄지 않는다', () => {
    const before = chronicThen('a', [[d(3), true], [d(10), true]])
    expect(correctedSummary(before, [...before, ev('a', d(11), false)])).toEqual({ total: 1, gained: 0 })
  })
})
