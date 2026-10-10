// 읽기 수준 — 밴드별 판정과 경계선 위치 (Phase 10). 2026-10-10 부터 판정은 「최근 7일(모자라면 100회)」·오차 구간 3단계다
import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import {
  buildLevel,
  judgeWindow,
  LEVEL_MIN_GRADES,
  LEVEL_MIN_IDIOMS,
  LEVEL_WINDOW_DAYS,
  READING_STABLE_DAYS,
  selectWindow,
  solidReachDays,
  type WindowEntry,
} from './level.ts'
import { newCard } from './scheduler.ts'
import type { Band } from '../lib/bands.ts'
import { cardKey, type CardState, type LearningEvent } from './types.ts'

const band: Record<string, Band> = { b1: 1, b2: 2, b3: 3, b4: 4 }
/** 표현 id 는 `b1-7` 처럼 코스 접두사를 달고 있다 */
const bandOf = (id: string) => band[id.slice(0, 2)]

let n = 0
/** 로컬 2026-09-`d` 정오에서 `i` 초 뒤 */
const at = (d: number, i = 0) => new Date(2026, 8, d, 12, 0, i).getTime()
const ev = (idiomId: string, correct: boolean, when: number): LearningEvent => ({
  id: `e${n++}`, userId: 'local', deviceId: 'd', at: when, idiomId,
  cardType: 'reading', mistakeType: null, deletedAt: null,
  type: 'review', grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1,
})

/**
 * 한 날(`d`)에 코스 `prefix` 를 정답 c · 오답 w 개 채점한다. 표현은 `idioms` 개를 돌려 쓴다
 * (기본은 채점마다 서로 다른 표현 — 판정의 표현 수 문턱을 넘기려는 것이다)
 */
function batch(prefix: string, c: number, w: number, d: number, idioms = c + w): LearningEvent[] {
  return Array.from({ length: c + w }, (_, i) => ev(`${prefix}-${i % idioms}`, i < c, at(d, i)))
}

describe('judgeWindow — 오차 구간 3단계', () => {
  const win = (c: number, w: number, idioms = c + w): WindowEntry[] =>
    Array.from({ length: c + w }, (_, i) => ({ date: '2026-09-01', correct: i < c, idiomId: `x${i % idioms}` }))

  it('표본이 없으면 unseen, 최소 미만이면 thin', () => {
    expect(judgeWindow([]).status).toBe('unseen')
    expect(judgeWindow(win(LEVEL_MIN_GRADES - 1, 0)).status).toBe('thin')
  })

  it('채점 수가 충분해도 서로 다른 표현이 적으면 thin 이다 — 같은 표현 반복은 독립이 아니다', () => {
    expect(judgeWindow(win(150, 0, LEVEL_MIN_IDIOMS - 1)).status).toBe('thin')
    expect(judgeWindow(win(150, 0, LEVEL_MIN_IDIOMS)).status).toBe('solid')
  })

  it('구간의 아래쪽이 문턱 이상이면 solid, 위쪽이 문턱 미만이면 shaky, 걸치면 near', () => {
    expect(judgeWindow(win(90, 10)).status).toBe('solid') // 구간 [0.83, 0.94]
    expect(judgeWindow(win(85, 15)).status).toBe('near') // 구간 [0.77, 0.91] — 점은 문턱 위인데 안정이라 못 한다
    expect(judgeWindow(win(80, 20)).status).toBe('near') // 80% 정확히 문턱
    expect(judgeWindow(win(73, 27)).status).toBe('near') // 구간 [0.64, 0.81] — 위쪽이 문턱을 넘는다
    expect(judgeWindow(win(72, 28)).status).toBe('shaky') // 구간 [0.63, 0.799] — 위쪽이 문턱 아래다
    expect(judgeWindow(win(60, 40)).status).toBe('shaky') // 구간 [0.50, 0.69]
  })

  it('표본이 커지면 같은 정답률도 선명해진다', () => {
    expect(judgeWindow(win(85, 15)).status).toBe('near')
    expect(judgeWindow(win(850, 150)).status).toBe('solid') // 85% 가 1000회면 문턱 위
    expect(judgeWindow(win(75, 25)).status).toBe('near')
    expect(judgeWindow(win(750, 250)).status).toBe('shaky') // 75% 가 1000회면 문턱 아래
  })
})

describe('selectWindow — 최근 7일, 모자라면 최근 100회 (둘 중 넓은 쪽)', () => {
  const entry = (date: string): WindowEntry => ({ date, correct: true, idiomId: 'x' })
  const days = (date: string, count: number) => Array.from({ length: count }, () => entry(date))

  it('마지막 채점일 기준 7일 안의 채점 전부를 쓴다 — 하루 220회 학습자는 창이 커진다', () => {
    const entries = [...days('2026-09-01', 50), ...days('2026-09-20', 150), ...days('2026-09-26', 150)]
    // 9/26 기준 7일 = 9/20~9/26 → 300 개, 9/1 의 50 개는 밖이다
    expect(selectWindow(entries)).toHaveLength(300)
  })

  it('7일 안이 100회에 못 미치면 최근 100회까지 넓힌다', () => {
    const entries = [...days('2026-09-01', 80), ...days('2026-09-26', 40)]
    expect(selectWindow(entries)).toHaveLength(LEVEL_MIN_GRADES)
  })

  it('기준일은 오늘이 아니라 마지막 채점일이다 — 한참 쉬어도 창이 안 빈다', () => {
    const entries = [...days('2025-01-01', 10), ...days('2025-01-03', 200)]
    expect(selectWindow(entries)).toHaveLength(210) // 1/3 기준 7일 안이라 1/1 도 들어온다
    expect(selectWindow([])).toEqual([])
  })

  it('7일째 경계 — 창은 LEVEL_WINDOW_DAYS 일을 덮는다', () => {
    expect(LEVEL_WINDOW_DAYS).toBe(7)
    const entries = [...days('2026-09-19', 120), ...days('2026-09-20', 120), ...days('2026-09-26', 120)]
    // 9/26 - 9/20 = 6일 → 들어온다, 9/19 는 7일 → 나간다
    expect(selectWindow(entries)).toHaveLength(240)
  })
})

describe('buildLevel', () => {
  it('기본 학습 범위(밴드 1~3)는 기록이 없어도 행이 선다', () => {
    const level = buildLevel([], bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3])
    expect(level.bands.every((b) => b.status === 'unseen')).toBe(true)
    expect(level.solidThrough).toBeNull()
    expect(level.nearThrough).toBeNull()
    expect(level.near).toEqual([])
    expect(level.edge).toBeNull()
    expect(level.totalReadings).toBe(0)
  })

  it('푼 적 있는 밴드는 범위 밖이어도 행이 선다', () => {
    const level = buildLevel(batch('b4', 5, 0, 1), bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3, 4])
  })

  it('표본이 최소치 미만이면 판정하지 않고 thin 이다', () => {
    const level = buildLevel(batch('b1', LEVEL_MIN_GRADES - 1, 0, 1), bandOf)
    expect(level.bands[0].status).toBe('thin')
    expect(level.solidThrough).toBeNull()
  })

  it('안정·기준 부근·흔들림을 가르고, 행에 오차 구간과 표현 수가 실린다', () => {
    const level = buildLevel(
      [...batch('b1', 100, 0, 1), ...batch('b2', 80, 20, 1), ...batch('b3', 40, 60, 1)],
      bandOf,
    )
    expect(level.bands.map((b) => b.status)).toEqual(['solid', 'near', 'shaky'])
    expect(level.solidThrough).toBe(1)
    expect(level.nearThrough).toBe(2)
    expect(level.near).toEqual([2])
    expect(level.edge).toBe(3)
    const b2 = level.bands[1]!
    expect(b2).toMatchObject({ seen: 100, correct: 80, idioms: 100 })
    expect(b2.ci[0]).toBeLessThan(0.8)
    expect(b2.ci[1]).toBeGreaterThan(0.8)
    expect(level.totalReadings).toBe(300)
  })

  it('solidThrough 는 낮은 밴드부터 끊기지 않은 구간만 센다', () => {
    // 밴드1 흔들림 · 밴드2 안정 — 밴드2 가 안정이어도 앞이 끊겼으니 solidThrough 는 null
    const level = buildLevel([...batch('b1', 40, 60, 1), ...batch('b2', 100, 0, 1)], bandOf)
    expect(level.solidThrough).toBeNull()
    expect(level.nearThrough).toBeNull()
    expect(level.edge).toBe(1)
  })

  it('기준 부근은 안정의 끊김이지 흔들림이 아니다 — 경계로 안 잡히고 nearThrough 가 이어진다', () => {
    const level = buildLevel(
      [...batch('b1', 80, 20, 1), ...batch('b2', 100, 0, 1), ...batch('b3', 80, 20, 1)],
      bandOf,
    )
    expect(level.solidThrough).toBeNull() // 밴드 1 이 near 라 안정 구간이 시작을 못 한다
    expect(level.nearThrough).toBe(3)
    expect(level.near).toEqual([1, 3])
    expect(level.edge).toBeNull()
  })

  it('전부 안정이면 경계가 없다 — 아직 벽을 안 만난 상태', () => {
    const level = buildLevel(
      [...batch('b1', 100, 0, 1), ...batch('b2', 100, 0, 1), ...batch('b3', 100, 0, 1)],
      bandOf,
    )
    expect(level.solidThrough).toBe(3)
    expect(level.edge).toBeNull()
  })
})

describe('밴드 판정은 최근 7일만 본다 (2026-10-10)', () => {
  it('창 밖의 옛 기록은 판정에서 빠진다 — 실력이 늘면 사다리가 올라간다', () => {
    // 옛날(9/1)에 150번 다 틀리고, 최근(9/20~9/26)에 150번을 다 맞혔다
    const events = [...batch('b1', 0, 150, 1), ...batch('b1', 150, 0, 20)]
    const row = buildLevel(events, bandOf).bands.find((b) => b.band === 1)!
    expect(row.seen).toBe(150)
    expect(row.rate).toBe(1)
    expect(row.status).toBe('solid')
  })

  it('반대로 최근에 무너지면 바로 흔들림이 된다', () => {
    const events = [...batch('b1', 150, 0, 1), ...batch('b1', 0, 150, 20)]
    expect(buildLevel(events, bandOf).bands.find((b) => b.band === 1)!.status).toBe('shaky')
  })

  it('하루에 많이 풀수록 한 세션의 요동이 덜 흔든다 — 30회 창에서는 뒤집히던 값이다', () => {
    // 220회 중 정답 180(82%). 마지막 30회가 전부 오답이어도 창은 하루 전체라 바뀌지 않는다
    const events = [...batch('b1', 180, 10, 5, 190), ...batch('b1', 0, 30, 5, 30)]
    const row = buildLevel(events, bandOf).bands.find((b) => b.band === 1)!
    expect(row.seen).toBe(220)
    expect(row.rate).toBeCloseTo(180 / 220)
  })

  it('누적 총계는 창에 안 잘린다 — 성취도는 깎이지 않는다', () => {
    const events = [...batch('b1', 0, 150, 1), ...batch('b1', 150, 0, 20)]
    const level = buildLevel(events, bandOf)
    expect(level.totalReadings).toBe(300)
    expect(level.bands.reduce((s, b) => s + b.seen, 0)).toBe(150)
  })

  it('창은 밴드마다 따로 잡힌다 — 기준일이 그 밴드의 마지막 채점일이다', () => {
    const events = [...batch('b1', 150, 0, 1), ...batch('b2', 150, 0, 20)]
    const level = buildLevel(events, bandOf)
    expect(level.bands.find((b) => b.band === 1)!.seen).toBe(150) // 9/1 하나뿐이라 그 날이 기준이다
    expect(level.bands.find((b) => b.band === 2)!.seen).toBe(150)
  })

  it('시각이 뒤섞여 들어와도 시간순으로 자른다 — 기기 병합 순서에 안 흔들린다', () => {
    const early = batch('b1', 0, 150, 1)
    const late = batch('b1', 150, 0, 20)
    const shuffled = [...late, ...early] // 일부러 거꾸로 넘긴다
    expect(buildLevel(shuffled, bandOf).bands.find((b) => b.band === 1)!.rate).toBe(1)
  })
})

describe('buildLevel — 붙은 숙어 (재고)', () => {
  const card = (stability: number, state: State) => ({
    ...newCard(0),
    state,
    stability,
    due: new Date(0),
  })
  const cardState = (idiomId: string, stability: number, state = State.Review): CardState => ({
    idiomId,
    cardType: 'reading' as const,
    card: card(stability, state),
    mistakes: {},
    wrong: 0,
    streak: 0,
    lastAt: 1,
  })
  const cards = (...rows: CardState[]) =>
    new Map(rows.map((r) => [cardKey(r.idiomId, r.cardType), r]))

  it('카드 상태를 안 넘기면 0 이다 — 기존 호출부가 안 깨진다', () => {
    const level = buildLevel(batch('b1', 10, 0, 1), bandOf)
    expect(level.bands[0].met).toBe(0)
    expect(level.bands[0].stable).toBe(0)
  })

  it('안정 기준을 넘긴 읽기 카드만 센다', () => {
    const level = buildLevel(
      batch('b1', 10, 0, 1),
      (id) => (id.startsWith('b1') ? 1 : undefined),
      cards(
        cardState('b1a', READING_STABLE_DAYS + 1),
        cardState('b1b', READING_STABLE_DAYS - 1),
        cardState('b1c', READING_STABLE_DAYS),
      ),
    )
    expect(level.bands[0].met).toBe(3)
    expect(level.bands[0].stable).toBe(2)
  })

  // 밴드 4 의 숙지도 행에는 센다 — 리포트 표가 그 값을 낸다 (2026-10-01). 판정·총계에는 안 들어간다
  it('밴드 4 의 안정 카드도 행에는 세고, 수준 판정에는 영향이 없다', () => {
    const level = buildLevel(
      [...batch('b1', 100, 0, 1), ...batch('b4', 100, 0, 1)],
      bandOf,
      cards(cardState('b1-0', READING_STABLE_DAYS + 1), cardState('b4-0', READING_STABLE_DAYS + 1)),
    )
    expect(level.bands.find((b) => b.band === 4)).toMatchObject({ met: 1, stable: 1 })
    expect(level.solidThrough).toBe(1)
  })

  it('재학습 중인 카드는 간격이 길어도 안 센다 — 지금 틀리고 있는 것이다', () => {
    const level = buildLevel(
      [],
      () => 1,
      cards(cardState('x', READING_STABLE_DAYS + 30, State.Relearning)),
    )
    expect(level.bands[0].met).toBe(1)
    expect(level.bands[0].stable).toBe(0)
  })

  it('뜻 카드는 안 센다 — 읽기 수준이다', () => {
    const meaning: CardState = {
      ...cardState('m', READING_STABLE_DAYS + 10),
      cardType: 'meaning' as const,
    }
    const level = buildLevel([], () => 1, new Map([[cardKey('m', 'meaning'), meaning]]))
    expect(level.bands[0].met).toBe(0)
  })

  it('정답률이 흔들려도 붙은 개수는 그대로다 — 이게 수준과 흔들림을 가르는 지점이다', () => {
    const shaky = buildLevel(
      batch('b1', 40, 60, 1),
      (id) => (id.startsWith('b1') ? 1 : undefined),
      cards(cardState('b1a', READING_STABLE_DAYS + 1), cardState('b1b', READING_STABLE_DAYS + 1)),
    )
    expect(shaky.bands[0].status).toBe('shaky')
    expect(shaky.bands[0].stable).toBe(2)
  })
})

describe('수준은 밴드 0~3 으로 잰다 (2026-09-26)', () => {
  // 밴드 4 는 출제 범위 밖이라 **담은 것만** 들어온다. 내가 골라 넣은 몇 개가 흔들린다고
  // 「밴드 4 가 경계」라고 말하면 사다리의 뜻이 달라진다 — 진도가 아니라 곁가지다
  it('밴드 4 가 흔들려도 경계로 안 잡는다', () => {
    const level = buildLevel(
      [...batch('b1', 100, 0, 1), ...batch('b2', 100, 0, 1), ...batch('b3', 100, 0, 1), ...batch('b4', 40, 60, 1)],
      bandOf,
    )
    expect(level.bands.find((b) => b.band === 4)?.status).toBe('shaky')
    // 판정에서는 빠진다 — 밴드 3까지 안정이고 경계는 없다
    expect(level.solidThrough).toBe(3)
    expect(level.edge).toBeNull()
  })

  it('표에는 그대로 남는다 — 출제·정답률은 볼 값이 있다', () => {
    const level = buildLevel(batch('b4', 5, 5, 1), bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3, 4])
    expect(level.bands.find((b) => b.band === 4)?.seen).toBe(10)
  })

  it('밴드 4 가 안정이어도 그것 때문에 「밴드 4까지 안정」이 되지 않는다', () => {
    const level = buildLevel(
      [...batch('b1', 100, 0, 1), ...batch('b2', 100, 0, 1), ...batch('b3', 100, 0, 1), ...batch('b4', 100, 0, 1)],
      bandOf,
    )
    expect(level.solidThrough).toBe(3)
  })
})

describe('solidReachDays', () => {
  it('밴드 1 이 안정에 닿은 날을 낸다', () => {
    const days = solidReachDays(batch('b1', 100, 0, 3), bandOf)
    expect([...days]).toEqual([['2026-09-03', 1]])
  })

  it('새 높이에 닿은 날만 — 판정이 내려갔다 되찾은 날은 다시 안 센다', () => {
    const events = [
      ...batch('b1', 100, 0, 1), // 밴드 1 도달
      ...batch('b1', 0, 100, 2), // 100/200 — 흔들림으로 내려감
      ...batch('b1', 500, 0, 3), // 600/700 되찾음 — 새 높이 아님
      ...batch('b2', 100, 0, 4), ...batch('b3', 100, 0, 4), // 밴드 3 까지
    ]
    expect([...solidReachDays(events, bandOf)]).toEqual([
      ['2026-09-01', 1],
      ['2026-09-04', 3],
    ])
  })

  it('마지막 날의 도달 높이는 buildLevel 의 solidThrough 와 같다', () => {
    const events = [...batch('b1', 100, 0, 5), ...batch('b2', 100, 0, 6)]
    const days = solidReachDays(events, bandOf)
    expect([...days.values()].at(-1)).toBe(buildLevel(events, bandOf).solidThrough)
  })

  it('밴드 4 는 판정에서 빠진다', () => {
    expect(solidReachDays(batch('b4', 100, 0, 1), bandOf).size).toBe(0)
  })

  it('표본이 모자라면 도달로 안 센다', () => {
    expect(solidReachDays(batch('b1', LEVEL_MIN_GRADES - 1, 0, 1), bandOf).size).toBe(0)
  })
})
