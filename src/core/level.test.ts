// 읽기 수준 — 밴드별 판정과 경계선 위치 (Phase 10)
import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { buildLevel, LEVEL_MIN_SEEN, LEVEL_WINDOW, READING_STABLE_DAYS } from './level.ts'
import { newCard } from './scheduler.ts'
import type { Band } from '../lib/bands.ts'
import { cardKey, type CardState, type LearningEvent } from './types.ts'

const band: Record<string, Band> = { b1: 1, b2: 2, b3: 3, b4: 4 }
let n = 0
const ev = (idiomId: string, correct: boolean): LearningEvent => ({
  id: `e${n++}`, userId: 'local', deviceId: 'd', at: n, idiomId,
  cardType: 'reading', mistakeType: null, deletedAt: null,
  type: 'review', grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1,
})

/** 한 밴드에 정답 c 개 · 오답 w 개 */
function run(idiomId: string, c: number, w: number): LearningEvent[] {
  return [
    ...Array.from({ length: c }, () => ev(idiomId, true)),
    ...Array.from({ length: w }, () => ev(idiomId, false)),
  ]
}

const bandOf = (id: string) => band[id]

describe('buildLevel', () => {
  it('기본 학습 범위(밴드 1~3)는 기록이 없어도 행이 선다', () => {
    const level = buildLevel([], bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3])
    expect(level.bands.every((b) => b.status === 'unseen')).toBe(true)
    expect(level.solidThrough).toBeNull()
    expect(level.edge).toBeNull()
    expect(level.totalReadings).toBe(0)
  })

  it('푼 적 있는 밴드는 범위 밖이어도 행이 선다', () => {
    const level = buildLevel(run('b4', 5, 0), bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3, 4])
  })

  it('표본이 최소치 미만이면 판정하지 않고 thin 이다', () => {
    const level = buildLevel(run('b1', LEVEL_MIN_SEEN - 1, 0), bandOf)
    expect(level.bands[0].status).toBe('thin')
    expect(level.solidThrough).toBeNull()
  })

  it('정답률 80% 이상이면 solid, 미만이면 shaky', () => {
    // 밴드1 9/10 = 90% · 밴드2 8/10 = 80%(경계값 포함) · 밴드3 4/10 = 40%
    const level = buildLevel(
      [...run('b1', 9, 1), ...run('b2', 8, 2), ...run('b3', 4, 6)],
      bandOf,
    )
    expect(level.bands.map((b) => b.status)).toEqual(['solid', 'solid', 'shaky'])
    expect(level.solidThrough).toBe(2)
    expect(level.edge).toBe(3)
    expect(level.totalReadings).toBe(30)
  })

  it('solidThrough 는 낮은 밴드부터 끊기지 않은 구간만 센다', () => {
    // 밴드1 흔들림 · 밴드2 안정 — 밴드2 가 안정이어도 앞이 끊겼으니 solidThrough 는 null
    const level = buildLevel([...run('b1', 4, 6), ...run('b2', 10, 0)], bandOf)
    expect(level.solidThrough).toBeNull()
    expect(level.edge).toBe(1)
  })

  it('전부 안정이면 경계가 없다 — 아직 벽을 안 만난 상태', () => {
    const level = buildLevel(
      [...run('b1', 10, 0), ...run('b2', 10, 0), ...run('b3', 10, 0)],
      bandOf,
    )
    expect(level.solidThrough).toBe(3)
    expect(level.edge).toBeNull()
  })
})

describe('밴드 판정은 최근 LEVEL_WINDOW 회만 본다 (2026-09-13)', () => {
  it('창 밖의 옛 기록은 판정에서 빠진다 — 실력이 늘면 사다리가 올라간다', () => {
    // 옛날에 30번 다 틀리고, 최근 30번을 다 맞혔다
    const events = [...run('b1', 0, LEVEL_WINDOW), ...run('b1', LEVEL_WINDOW, 0)]
    const row = buildLevel(events, bandOf).bands.find((b) => b.band === 1)!
    expect(row.seen).toBe(LEVEL_WINDOW)
    expect(row.rate).toBe(1)
    expect(row.status).toBe('solid')
  })

  it('반대로 최근에 무너지면 바로 흔들림이 된다', () => {
    const events = [...run('b1', LEVEL_WINDOW, 0), ...run('b1', 0, LEVEL_WINDOW)]
    expect(buildLevel(events, bandOf).bands.find((b) => b.band === 1)!.status).toBe('shaky')
  })

  it('누적 총계는 창에 안 잘린다 — 성취도는 깎이지 않는다', () => {
    const events = [...run('b1', 0, LEVEL_WINDOW), ...run('b1', LEVEL_WINDOW, 0)]
    const level = buildLevel(events, bandOf)
    expect(level.totalReadings).toBe(LEVEL_WINDOW * 2)
    // 밴드 행의 seen 합과는 다르다
    expect(level.bands.reduce((n, b) => n + b.seen, 0)).toBe(LEVEL_WINDOW)
  })

  it('창보다 적게 풀었으면 전부 센다', () => {
    const events = run('b1', 4, 1)
    const row = buildLevel(events, bandOf).bands.find((b) => b.band === 1)!
    expect(row.seen).toBe(5)
    expect(row.correct).toBe(4)
  })

  it('창은 밴드마다 따로 잡힌다', () => {
    const events = [
      ...run('b1', 0, LEVEL_WINDOW), ...run('b1', LEVEL_WINDOW, 0),
      ...run('b2', 3, 2),
    ]
    const level = buildLevel(events, bandOf)
    expect(level.bands.find((b) => b.band === 1)!.seen).toBe(LEVEL_WINDOW)
    expect(level.bands.find((b) => b.band === 2)!.seen).toBe(5)
  })

  it('시각이 뒤섞여 들어와도 시간순으로 자른다 — 기기 병합 순서에 안 흔들린다', () => {
    const early = run('b1', 0, LEVEL_WINDOW) // at 이 작다
    const late = run('b1', LEVEL_WINDOW, 0) // at 이 크다
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
    const level = buildLevel(run('b1', 10, 0), bandOf)
    expect(level.bands[0].met).toBe(0)
    expect(level.bands[0].stable).toBe(0)
  })

  it('안정 문턱을 넘긴 읽기 카드만 센다', () => {
    const level = buildLevel(
      run('b1', 10, 0),
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
      run('b1', 5, 5),
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
    const level = buildLevel([...run('b1', 10, 0), ...run('b2', 10, 0), ...run('b3', 10, 0), ...run('b4', 5, 5)], bandOf)
    expect(level.bands.find((b) => b.band === 4)?.status).toBe('shaky')
    // 판정에서는 빠진다 — 밴드 3까지 안정이고 경계는 없다
    expect(level.solidThrough).toBe(3)
    expect(level.edge).toBeNull()
  })

  it('표에는 그대로 남는다 — 출제·정답률은 볼 값이 있다', () => {
    const level = buildLevel(run('b4', 5, 5), bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3, 4])
    expect(level.bands.find((b) => b.band === 4)?.seen).toBe(10)
  })

  it('밴드 4 가 안정이어도 그것 때문에 「밴드 4까지 안정」이 되지 않는다', () => {
    const level = buildLevel([...run('b1', 10, 0), ...run('b2', 10, 0), ...run('b3', 10, 0), ...run('b4', 10, 0)], bandOf)
    expect(level.solidThrough).toBe(3)
  })
})
