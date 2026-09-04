// 이벤트 재생의 결정론과 파생 집계를 검증한다 (checklist Phase 4)
import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { mistakeTotals, replay } from './replay.ts'
import { newEventId } from '../db/events.ts'
import type { LearningEvent, MistakeType, ReviewEvent } from './types.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)

/** 난수 대신 순번을 쓰는 결정론적 id 생성기 */
function idFactory() {
  let n = 0
  return (at: number) => newEventId(at, () => (n = (n * 31 + 7) % 36) / 36)
}

function review(
  nextId: (at: number) => string,
  at: number,
  idiomId: string,
  correct: boolean,
  mistakeType: MistakeType | null = null,
  cardType: ReviewEvent['cardType'] = 'reading',
): ReviewEvent {
  return {
    id: nextId(at), userId: 'local', deviceId: 'dev-a', at, idiomId, cardType,
    mistakeType, deletedAt: null, type: 'review',
    grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1200,
  }
}

/** 3개 숙어 × 여러 회차의 이벤트 시퀀스 */
function sampleEvents(): LearningEvent[] {
  const nextId = idFactory()
  return [
    review(nextId, T0, '1', false, 'RENDAKU'),
    review(nextId, T0 + DAY, '1', true),
    review(nextId, T0 + DAY, '2', false, 'SOKUON'),
    review(nextId, T0 + 2 * DAY, '2', false, 'SOKUON'),
    review(nextId, T0 + 3 * DAY, '3', true),
    review(nextId, T0 + 3 * DAY, '3', true, null, 'meaning'),
    {
      id: nextId(T0 + 4 * DAY), userId: 'local', deviceId: 'dev-b', at: T0 + 4 * DAY,
      idiomId: '3', cardType: 'meaning', mistakeType: null, deletedAt: null,
      type: 'meaningKnown', known: true,
    },
    review(nextId, T0 + 5 * DAY, '1', false, 'KO_INTERFERENCE'),
  ]
}

describe('replay — 결정론', () => {
  it('같은 이벤트 시퀀스를 두 번 재생하면 같은 상태가 나온다', () => {
    const events = sampleEvents()
    expect(replay(events)).toEqual(replay(events))
  })

  it('입력 순서를 섞어도 같은 상태가 나온다 — 기기별 파일 합집합 병합의 전제', () => {
    const events = sampleEvents()
    const shuffled = [...events].reverse()
    const rotated = [...events.slice(3), ...events.slice(0, 3)]
    expect(replay(shuffled)).toEqual(replay(events))
    expect(replay(rotated)).toEqual(replay(events))
  })

  it('별개 인스턴스라 재생 결과를 나중에 건드려도 원본이 안 변한다', () => {
    const events = sampleEvents()
    const a = replay(events)
    a.cards.clear()
    expect(replay(events).cards.size).toBe(4)
  })
})

describe('replay — 파생 상태', () => {
  const state = replay(sampleEvents())

  it('카드 타입별로 따로 스케줄한다', () => {
    expect([...state.cards.keys()].sort()).toEqual([
      '1:reading', '2:reading', '3:meaning', '3:reading',
    ])
  })

  it('오답 유형을 카드별로 누적한다', () => {
    expect(state.cards.get('2:reading')!.mistakes).toEqual({ SOKUON: 2 })
    expect(state.cards.get('1:reading')!.mistakes).toEqual({ RENDAKU: 1, KO_INTERFERENCE: 1 })
    expect(mistakeTotals(state)).toEqual({ RENDAKU: 1, SOKUON: 2, KO_INTERFERENCE: 1 })
  })

  it('신규 카드는 연속 오답으로도 학습 단계를 못 벗어난다', () => {
    // Relearning 은 Review 까지 갔던 카드가 무너졌을 때만 나온다. 모드 재배치가 이 구분에 기댄다
    expect(state.cards.get('2:reading')!.card.state).toBe(State.Learning)
    expect(state.cards.get('2:reading')!.card.reps).toBe(2)
    expect(state.cards.get('3:reading')!.card.reps).toBe(1)
  })

  it('진입 진단 응답을 마지막 값으로 들고 있는다', () => {
    expect(state.meaningKnown.get('3')).toBe(true)
    expect(state.meaningKnown.has('1')).toBe(false)
  })

  it('삭제된 이벤트는 재생에서 빠진다', () => {
    const events = sampleEvents()
    const kept = events.filter((e) => e.idiomId !== '2')
    const tombstoned = events.map((e) =>
      e.idiomId === '2' ? { ...e, deletedAt: T0 + 9 * DAY } : e,
    )
    expect(replay(tombstoned)).toEqual(replay(kept))
    expect(replay(tombstoned).applied).toBe(kept.length)
  })
})

describe('replay — 음독 파생 집계', () => {
  const pairs: Record<string, string[]> = {
    '1': ['三:kun:み', '月:kun:つき'],
    '2': ['発:on:はつ', '達:on:たつ'],
    '3': ['構:on:こう', '成:on:せい'],
  }
  const state = replay(sampleEvents(), { pairsOf: (id) => pairs[id] ?? [] })

  it('읽기 카드 채점만 음독 집계에 반영한다', () => {
    expect(state.onyomi.get('発:on:はつ')).toEqual({ pairId: '発:on:はつ', seen: 2, wrong: 2 })
    expect(state.onyomi.get('三:kun:み')).toEqual({ pairId: '三:kun:み', seen: 3, wrong: 2 })
    // 3번 숙어는 읽기 1회 + 뜻 1회지만 음독은 읽기 쪽만 센다
    expect(state.onyomi.get('構:on:こう')).toEqual({ pairId: '構:on:こう', seen: 1, wrong: 0 })
  })

  it('pairsOf 를 안 주면 집계를 건너뛴다', () => {
    expect(replay(sampleEvents()).onyomi.size).toBe(0)
  })
})

describe('newEventId — 시간순 정렬', () => {
  it('시각이 빠른 이벤트의 id 가 문자열 비교에서도 앞선다', () => {
    const a = newEventId(T0, () => 0.99)
    const b = newEventId(T0 + 1, () => 0)
    expect(a < b).toBe(true)
  })

  it('같은 시각이면 난수 부분으로 갈린다', () => {
    expect(newEventId(T0, () => 0)).not.toBe(newEventId(T0, () => 0.5))
  })
})
