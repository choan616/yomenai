// 모드 자동 배정 3단계와 출제 선택 로직을 검증한다 (checklist Phase 4)
import { describe, expect, it } from 'vitest'
import { State, type Card } from 'ts-fsrs'
import { activeCardTypes, assignMode } from './mode.ts'
import { selectSession, weakness, type SessionCandidate } from './select.ts'
import { newCard } from './scheduler.ts'
import type { ReplayState } from './replay.ts'
import { cardKey, type CardState, type CardType, type StudyMode } from './types.ts'

const T0 = Date.UTC(2026, 0, 1)
const DAY = 86_400_000

function emptyState(): ReplayState {
  return { cards: new Map(), meaningKnown: new Map(), onyomi: new Map(), applied: 0 }
}

function put(state: ReplayState, idiomId: string, cardType: CardType, card: Card): void {
  const entry: CardState = { idiomId, cardType, card, mistakes: {}, lastAt: T0 }
  state.cards.set(cardKey(idiomId, cardType), entry)
}

function candidate(
  id: string,
  band: 0 | 1 | 2 | 3 | 4,
  mode: StudyMode,
  pairIds: string[] = [],
): SessionCandidate {
  return { idiomId: id, band, mode, pairIds }
}

describe('assignMode — 3단계 자동 배정', () => {
  it('1단계 — 동형동의는 교정, 동형이의·일본 고유는 확장', () => {
    expect(assignMode({ category: 1 })).toEqual({ mode: 'correction', source: 'korean-class' })
    expect(assignMode({ category: 2 })).toEqual({ mode: 'expansion', source: 'korean-class' })
    expect(assignMode({ category: 3 })).toEqual({ mode: 'expansion', source: 'korean-class' })
  })

  it('2단계 — 진단 응답이 사전 분류를 덮는다', () => {
    expect(assignMode({ category: 2, meaningKnown: true }))
      .toEqual({ mode: 'correction', source: 'diagnostic' })
    expect(assignMode({ category: 1, meaningKnown: false }))
      .toEqual({ mode: 'expansion', source: 'diagnostic' })
  })

  it('3단계 — 뜻이 안정되면 교정으로 이관한다', () => {
    const stable = { ...newCard(T0), state: State.Review, stability: 30 }
    expect(assignMode({ category: 2, meaningKnown: false, meaningCard: stable }))
      .toEqual({ mode: 'correction', source: 'reassign' })
  })

  it('3단계 — 뜻이 무너지면 확장으로 되돌린다', () => {
    const lapsed = { ...newCard(T0), state: State.Relearning, stability: 40 }
    expect(assignMode({ category: 1, meaningKnown: true, meaningCard: lapsed }))
      .toEqual({ mode: 'expansion', source: 'reassign' })
  })

  it('3단계 — 아직 안정도 붕괴도 아니면 앞 단계 결정을 유지한다', () => {
    const learning = { ...newCard(T0), state: State.Learning, stability: 2 }
    expect(assignMode({ category: 2, meaningKnown: true, meaningCard: learning }))
      .toEqual({ mode: 'correction', source: 'diagnostic' })
  })

  it('교정은 읽기만, 확장은 읽기+뜻을 낸다', () => {
    expect(activeCardTypes('correction')).toEqual(['reading'])
    expect(activeCardTypes('expansion')).toEqual(['reading', 'meaning'])
  })
})

describe('weakness — 미숙 음독 가중', () => {
  it('오답률이 높은 음독을 품은 숙어가 높은 점수를 받는다', () => {
    const state = emptyState()
    state.onyomi.set('a', { pairId: 'a', seen: 10, wrong: 8 })
    state.onyomi.set('b', { pairId: 'b', seen: 10, wrong: 0 })
    expect(weakness(['a'], state)).toBeCloseTo(0.8)
    expect(weakness(['b'], state)).toBeCloseTo(0)
    expect(weakness(['a', 'b'], state)).toBeCloseTo(0.4)
  })

  it('한 번도 안 나온 음독은 중간값을 받는다 — 확실한 미숙보다는 낮게', () => {
    const state = emptyState()
    state.onyomi.set('a', { pairId: 'a', seen: 4, wrong: 4 })
    expect(weakness(['unseen'], state)).toBe(0.5)
    expect(weakness(['a'], state)).toBeGreaterThan(weakness(['unseen'], state))
  })
})

describe('selectSession — 구성 규칙', () => {
  it('기한이 지난 카드를 신규보다 먼저 낸다', () => {
    const state = emptyState()
    put(state, 'old', 'reading', { ...newCard(T0 - 10 * DAY), due: new Date(T0 - DAY) })
    const picked = selectSession(
      [candidate('old', 1, 'correction'), candidate('new', 1, 'correction')],
      state,
      { now: T0, limit: 2 },
    )
    expect(picked.map((p) => p.idiomId)).toEqual(['old', 'new'])
    expect(picked[0].due).toBe(true)
    expect(picked[1].due).toBe(false)
  })

  it('기한이 안 된 카드는 아예 안 낸다', () => {
    const state = emptyState()
    put(state, 'later', 'reading', { ...newCard(T0), due: new Date(T0 + DAY) })
    expect(selectSession([candidate('later', 1, 'correction')], state, { now: T0, limit: 5 }))
      .toEqual([])
  })

  it('기한 초과가 큰 카드를 먼저 낸다', () => {
    const state = emptyState()
    put(state, 'a', 'reading', { ...newCard(T0), due: new Date(T0 - DAY) })
    put(state, 'b', 'reading', { ...newCard(T0), due: new Date(T0 - 5 * DAY) })
    const picked = selectSession(
      [candidate('a', 1, 'correction'), candidate('b', 1, 'correction')],
      state,
      { now: T0, limit: 2 },
    )
    expect(picked.map((p) => p.idiomId)).toEqual(['b', 'a'])
  })

  it('신규는 낮은 밴드부터, 같은 밴드면 미숙 음독을 품은 쪽부터', () => {
    const state = emptyState()
    state.onyomi.set('weak', { pairId: 'weak', seen: 10, wrong: 9 })
    state.onyomi.set('solid', { pairId: 'solid', seen: 10, wrong: 0 })
    const picked = selectSession(
      [
        candidate('b3', 3, 'correction', ['weak']),
        candidate('b1-solid', 1, 'correction', ['solid']),
        candidate('b1-weak', 1, 'correction', ['weak']),
      ],
      state,
      { now: T0, limit: 3 },
    )
    expect(picked.map((p) => p.idiomId)).toEqual(['b1-weak', 'b1-solid', 'b3'])
  })

  it('밴드 0 은 기본적으로 신규 도입에서 빠진다', () => {
    const picked = selectSession(
      [candidate('easy', 0, 'correction'), candidate('mid', 1, 'correction')],
      emptyState(),
      { now: T0, limit: 5 },
    )
    expect(picked.map((p) => p.idiomId)).toEqual(['mid'])
  })

  it('minBand 를 내리면 밴드 0 도 들어온다', () => {
    const picked = selectSession([candidate('easy', 0, 'correction')], emptyState(), {
      now: T0,
      limit: 5,
      minBand: 0,
    })
    expect(picked.map((p) => p.idiomId)).toEqual(['easy'])
  })

  it('확장 숙어는 읽기·뜻 두 장을 낸다', () => {
    const picked = selectSession([candidate('x', 1, 'expansion')], emptyState(), {
      now: T0,
      limit: 5,
      ratio: { correction: 0, expansion: 1 },
    })
    expect(picked.map((p) => p.cardType).sort()).toEqual(['meaning', 'reading'])
  })

  it('모드 비율 기본값 7:3 을 지킨다', () => {
    const candidates = [
      ...Array.from({ length: 20 }, (_, i) => candidate(`c${i}`, 1, 'correction')),
      ...Array.from({ length: 20 }, (_, i) => candidate(`e${i}`, 1, 'expansion')),
    ]
    const picked = selectSession(candidates, emptyState(), { now: T0, limit: 10 })
    expect(picked.filter((p) => p.mode === 'correction')).toHaveLength(7)
    expect(picked.filter((p) => p.mode === 'expansion')).toHaveLength(3)
  })

  it('한쪽 모드가 부족하면 남은 자리를 다른 모드가 채운다', () => {
    const candidates = [
      ...Array.from({ length: 20 }, (_, i) => candidate(`c${i}`, 1, 'correction')),
      candidate('e0', 1, 'expansion'),
    ]
    const picked = selectSession(candidates, emptyState(), { now: T0, limit: 10 })
    expect(picked).toHaveLength(10)
    expect(picked.filter((p) => p.mode === 'expansion')).toHaveLength(2) // e0 의 읽기 + 뜻
  })

  it('같은 입력이면 같은 세션이 나온다 — 무작위를 쓰지 않는다', () => {
    const candidates = Array.from({ length: 30 }, (_, i) => candidate(`c${i}`, 1, 'correction'))
    const opts = { now: T0, limit: 12 }
    expect(selectSession(candidates, emptyState(), opts))
      .toEqual(selectSession(candidates, emptyState(), opts))
  })

  it('후보가 모자라면 세션이 짧아질 뿐 예외가 없다', () => {
    expect(selectSession([], emptyState(), { now: T0, limit: 20 })).toEqual([])
  })
})
