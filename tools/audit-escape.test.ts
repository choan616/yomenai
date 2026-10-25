// 벗어남 기준 실측 집계 검증 — 미래 정보 금지, 기준별 벗어남 시점, 날 경계, 무너짐, 주별 집계
import { describe, expect, it } from 'vitest'
import { completeWeeks, dayOf, escapeReport, findEscapes, median, readingReviews, wilson } from './audit-escape.ts'
import { correctedIndex } from '../src/core/corrected.ts'
import type { ReviewEvent } from '../src/core/types.ts'

const DAY = 864e5
/** 한국 표준시 2026-09-01 00:00 */
const BASE = Date.UTC(2026, 8, 1) - 9 * 36e5
const at = (day: number, hour = 12): number => BASE + day * DAY + hour * 36e5

let seq = 0
function ev(idiomId: string, when: number, correct: boolean, over: Partial<ReviewEvent> = {}): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at: when,
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

/** 오답 3회(0~2일)로 상습이 된 뒤 이어지는 기록. spec = [일, 정답 여부][] */
function chronicThen(id: string, rest: [number, boolean][]): ReviewEvent[] {
  return [
    ev(id, at(0), false),
    ev(id, at(1), false),
    ev(id, at(2), false),
    ...rest.map(([d, ok]) => ev(id, at(d), ok)),
  ]
}

const idxOf = (list: ReviewEvent[]): (number | undefined)[] => findEscapes(list).map((e) => e?.idx)

describe('dayOf', () => {
  it('한국 표준시 자정을 날 경계로 본다', () => {
    expect(dayOf(BASE)).toBe(dayOf(BASE + 36e5 * 23))
    expect(dayOf(BASE + DAY)).toBe(dayOf(BASE) + 1)
  })
})

describe('readingReviews', () => {
  it('삭제·뜻 카드를 빼고 같은 id 는 한 번만 센다', () => {
    const a = ev('a', at(0), true)
    const out = readingReviews([
      a,
      a,
      ev('a', at(1), true, { deletedAt: 5 }),
      ev('a', at(2), true, { cardType: 'meaning' }),
    ])
    expect(out).toHaveLength(1)
  })
})

describe('findEscapes — 기준별 벗어남 자리', () => {
  it('오답 3회 전에는 벗어날 수 없다', () => {
    const list = [ev('a', at(0), false), ev('a', at(1), false), ev('a', at(2), true), ev('a', at(3), true)]
    expect(findEscapes(list).every((e) => e === null)).toBe(true)
  })

  it('K1 은 연속 2회, K2 는 연속 3회 — 같은 날이어도 센다', () => {
    const list = chronicThen('a', [[3, true], [3, true], [3, true]])
    // 인덱스: 오답 0~2, 정답 3·4·5
    const [k1, k2, k3, k4, k5, k6] = idxOf(list)
    expect(k1).toBe(4)
    expect(k2).toBe(5)
    expect(k3).toBeUndefined() // 전부 3일이라 날이 하나뿐
    expect(k4).toBeUndefined()
    expect(k5).toBeUndefined() // 첫 정답에서 7일이 안 됨
    expect(k6).toBeUndefined() // 직전 만남이 같은 날
  })

  it('중간에 틀리면 연속이 끊긴다', () => {
    const list = chronicThen('a', [[3, true], [4, false], [5, true]])
    expect(idxOf(list)[0]).toBeUndefined()
  })

  it('K3·K4 는 연속 정답이 걸친 서로 다른 날 수로 센다', () => {
    const list = chronicThen('a', [[3, true], [3, true], [4, true], [5, true]])
    // 정답: 3일(idx3), 3일(4), 4일(5), 5일(6)
    const [k1, k2, k3, k4] = idxOf(list)
    expect(k1).toBe(4)
    expect(k2).toBe(5)
    expect(k3).toBe(5)
    expect(k4).toBe(6)
  })

  it('K5 는 연속 정답의 첫 정답에서 7일 이상 뒤의 정답이다', () => {
    const list = chronicThen('a', [[3, true], [9, true], [10, true]])
    const k5 = idxOf(list)[4]
    expect(k5).toBe(5) // 3일 → 10일 = 7일 (idx 5)
    expect(idxOf(chronicThen('b', [[3, true], [9, true]]))[4]).toBeUndefined() // 6일
  })

  it('K6 은 직전 만남에서 7일 이상 떨어진 정답 한 번이다', () => {
    expect(idxOf(chronicThen('a', [[9, true]]))[5]).toBe(3) // 2일 오답 → 9일 정답
    expect(idxOf(chronicThen('b', [[8, true]]))[5]).toBeUndefined() // 6일
  })
})

describe('escapeReport — 기준선 (미래 정보 금지)', () => {
  it('나중에 상습이 될 표현의 초기 정답은 상습 아님 쪽에 센다', () => {
    const r = escapeReport([
      ev('a', at(0), true), // 이 시점엔 오답 0회
      ev('a', at(1), false),
      ev('a', at(2), false),
      ev('a', at(3), false),
      ev('a', at(4), true), // 오답 3회 → 상습 시점
      ev('a', at(5), false),
    ])!
    expect(r.baselines.neverWrong.all).toEqual({ n: 1, wrong: 1 })
    expect(r.baselines.chronicAtTime.all).toEqual({ n: 1, wrong: 1 })
    expect(r.baselines.notChronic.all).toEqual({ n: 1, wrong: 1 })
    expect(r.baselines.chronicFinal.all).toEqual({ n: 2, wrong: 2 })
    expect(r.baselines.everything.all.n).toBe(2)
  })

  it('날 경계를 넘은 다음 만남과 같은 날을 가른다', () => {
    const r = escapeReport([
      ev('a', at(0, 9), true),
      ev('a', at(0, 15), false), // 같은 날, 오답
      ev('b', at(0), true),
      ev('b', at(1), true), // 날 경계 넘음, 정답
    ])!
    expect(r.baselines.everything.sameDay).toEqual({ n: 1, wrong: 1 })
    expect(r.baselines.everything.crossDay).toEqual({ n: 1, wrong: 0 })
  })
})

describe('escapeReport — 벗어남 뒤', () => {
  it('벗어남 뒤 첫 만남·이후 전체·무너짐을 센다', () => {
    // 오답 3회 → 정답 2회(K1 벗어남, idx 4) → 다음 날 오답 → 정답 → 오답
    const list = chronicThen('a', [[3, true], [3, true], [4, false], [5, true], [6, false]])
    const r = escapeReport(list)!
    const k1 = r.criteria[0]!
    expect(r.chronic).toBe(1)
    expect(k1.escaped).toBe(1)
    expect(k1.first.all).toEqual({ n: 1, wrong: 1 })
    expect(k1.first.crossDay).toEqual({ n: 1, wrong: 1 })
    expect(k1.afterAll).toEqual({ n: 3, wrong: 2 })
    // 직전이 정답이고 날이 바뀐 만남: 4일 오답(직전 3일 정답), 6일 오답(직전 5일 정답). 5일은 직전 오답이라 뺀다
    expect(k1.afterCond).toEqual({ n: 2, wrong: 2 })
    expect(k1.collapsed).toEqual([1, 1, 0])
    expect(k1.followed).toBe(1)
    expect(k1.collapsedFollowed).toEqual([1, 1, 0])
  })

  it('벗어남 뒤 만남이 없으면 noFollow 로 센다', () => {
    const r = escapeReport(chronicThen('a', [[3, true], [4, true]]))!
    expect(r.criteria[0]!.escaped).toBe(1)
    expect(r.criteria[0]!.noFollow).toBe(1)
    expect(r.criteria[0]!.first.all.n).toBe(0)
  })

  it('걸린 일수는 달력 날 차이다', () => {
    const r = escapeReport(chronicThen('a', [[5, true], [8, true]]))!
    const k1 = r.criteria[0]!
    expect(k1.daysFromChronic).toEqual([6]) // 2일 → 8일
    expect(k1.daysFromLastWrong).toEqual([6])
  })

  it('주별 신규는 첫 기록 날 기준 7일 단위다', () => {
    const list = [
      ...chronicThen('a', [[3, true], [4, true]]), // 4일 벗어남 → 주 1
      ev('b', at(7), false), ev('b', at(8), false), ev('b', at(9), false), ev('b', at(10), true), ev('b', at(11), true), // 주 2
    ]
    const r = escapeReport(list)!
    expect(r.criteria[0]!.weeklyNew).toEqual([1, 1])
    expect(r.weeklyChronic).toEqual([1, 1])
  })

  it('고정 지평은 데이터 끝까지 지평이 찬 벗어남만 대상으로 한다', () => {
    const list = [
      // a: 4일 벗어남(K1), 지평 안(18일까지) 오답 2회, 끝(25일)까지 지평이 참
      ...chronicThen('a', [[3, true], [4, true], [6, false], [8, false], [20, true]]),
      // b: 24일 벗어남(K1) — 25일까지 지평이 안 참
      ev('b', at(21), false), ev('b', at(22), false), ev('b', at(23), false), ev('b', at(23), true), ev('b', at(24), true),
      ev('c', at(25), true),
    ]
    const k1 = escapeReport(list)!.criteria[0]!
    expect(k1.escaped).toBe(2)
    expect(k1.horizon).toEqual({ eligible: 1, observed: 1, wrong1: 1, wrong2: 1 })
  })

  it('읽기 채점이 없으면 null', () => {
    expect(escapeReport([])).toBeNull()
  })
})

describe('보조 함수', () => {
  it('median', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('wilson 구간은 표본이 없으면 null, 있으면 점추정을 품는다', () => {
    expect(wilson(0, 0)).toBeNull()
    const [lo, hi] = wilson(36, 159)!
    expect(lo).toBeLessThan(22.6)
    expect(hi).toBeGreaterThan(22.6)
    expect(lo).toBeGreaterThan(0)
  })

  it('completeWeeks 는 끝까지 찬 주만 센다', () => {
    expect(completeWeeks(0, 13)).toBe(2)
    expect(completeWeeks(0, 12)).toBe(1)
  })
})

describe('앱의 바로잡은 표현 판정(src/core/corrected.ts)과 K5', () => {
  it('무작위 기록에서 같은 자리를 가리킨다 — 두 구현이 어긋나지 않게 묶는다', () => {
    // 고정 시드 선형 합동 난수 — 테스트가 매번 같게 돈다
    let s = 12345
    const rnd = (): number => {
      s = (s * 1103515245 + 12345) % 2 ** 31
      return s / 2 ** 31
    }
    for (let round = 0; round < 300; round++) {
      let t = BASE
      const list: ReviewEvent[] = []
      const n = 3 + Math.floor(rnd() * 14)
      for (let i = 0; i < n; i++) {
        t += Math.floor(rnd() * 5 * DAY)
        list.push(ev('r', t, rnd() < 0.55))
      }
      expect(correctedIndex(list)).toBe(findEscapes(list)[4]?.idx ?? null)
    }
  })
})
