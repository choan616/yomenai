// 이벤트 재생의 결정론과 파생 집계를 검증한다 (checklist Phase 4)
import { describe, expect, it } from 'vitest'
import { State } from 'ts-fsrs'
import { mistakeTotals, replay } from './replay.ts'
import { newEventId } from '../db/events.ts'
import { cardKey, type LearningEvent, type MistakeType, type ReviewEvent } from './types.ts'

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

/**
 * 오답 유형을 다시 매기는 훅 (2026-09-17, 노출 경로 일관성).
 *
 * replay 는 사전을 모르는 순수 접기라 저장된 `mistakeType` 을 그대로 셌다. 그래서 분류기를
 * 고친 뒤에도 **규칙 화면에서는 빠진 오답이 리포트에서는 그 유형으로 남아 있었다.**
 * 사전을 아는 쪽이 함수를 넘겨준다 — `pairsOf` 와 같은 관례다.
 */
describe('replay — 오답 유형 다시 매기기', () => {
  const events = (): LearningEvent[] => {
    const nextId = idFactory()
    return [
      review(nextId, T0, '1', false, 'RENDAKU'),
      review(nextId, T0 + DAY, '2', false, 'SOKUON'),
    ]
  }

  it('훅이 없으면 저장값을 그대로 센다 — 기존 동작', () => {
    const state = replay(events())
    expect(state.cards.get(cardKey('1', 'reading'))?.mistakes).toEqual({ RENDAKU: 1 })
  })

  it('훅이 null 을 내면 그 오답은 어느 유형에도 안 든다 — 미분류로 남는다', () => {
    const state = replay(events(), { mistakeOf: (e) => (e.mistakeType === 'RENDAKU' ? null : e.mistakeType) })
    expect(state.cards.get(cardKey('1', 'reading'))?.mistakes).toEqual({})
    // 틀린 횟수 자체는 그대로다 — 유형을 못 붙였을 뿐 오답은 오답이다
    expect(state.cards.get(cardKey('1', 'reading'))?.wrong).toBe(1)
  })

  it('훅이 다른 유형을 내면 그쪽으로 센다', () => {
    const state = replay(events(), {
      mistakeOf: (e) => (e.mistakeType === 'RENDAKU' ? 'KO_INTERFERENCE' : e.mistakeType),
    })
    expect(state.cards.get(cardKey('1', 'reading'))?.mistakes).toEqual({ KO_INTERFERENCE: 1 })
    expect(state.cards.get(cardKey('2', 'reading'))?.mistakes).toEqual({ SOKUON: 1 })
  })
})

describe('담아 둔 표현 — 마지막 이벤트가 이긴다 (2026-09-21)', () => {
  const star = (
    nextId: (at: number) => string,
    at: number,
    idiomId: string,
    on: boolean,
  ): LearningEvent => ({
    id: nextId(at), userId: 'local', deviceId: 'dev-a', at, idiomId,
    cardType: 'reading', mistakeType: null, deletedAt: null, type: 'star', on,
  })

  it('담기 → 빼기 → 다시 담기', () => {
    const nextId = idFactory()
    const events = [
      star(nextId, T0, 'a', true),
      star(nextId, T0 + DAY, 'a', false),
      star(nextId, T0 + 2 * DAY, 'a', true),
      star(nextId, T0, 'b', true),
      star(nextId, T0 + DAY, 'b', false),
    ]
    const state = replay(events)
    expect([...state.starred]).toEqual(['a'])
  })

  it('입력 순서를 뒤집어도 같다 — 기기별 파일을 합집합으로 받아도 흔들리지 않게', () => {
    const nextId = idFactory()
    const events = [
      star(nextId, T0, 'a', true),
      star(nextId, T0 + DAY, 'a', false),
    ]
    expect([...replay([...events].reverse()).starred]).toEqual([])
  })

  it('묘비는 세지 않는다', () => {
    const nextId = idFactory()
    const on = star(nextId, T0, 'a', true)
    const off = { ...star(nextId, T0 + DAY, 'a', false), deletedAt: T0 + 2 * DAY }
    expect([...replay([on, off]).starred]).toEqual(['a'])
  })

  it('채점 이벤트는 별을 안 건드린다 — 목록에서 빼는 건 select 의 몫이다', () => {
    const nextId = idFactory()
    const events = [star(nextId, T0, 'a', true), review(nextId, T0 + DAY, 'a', true)]
    expect([...replay(events).starred]).toEqual(['a'])
  })
})

/**
 * 앞으로 이벤트 타입을 더할 때의 보험 (2026-09-22).
 *
 * 로그는 append-only 라 기기 하나가 새 타입을 쓰기 시작하면, **아직 옛 빌드를 캐시한**
 * 다른 기기가 동기화로 그걸 받는다. 가드가 없으면 그 이벤트가 채점 경로로 떨어져
 * `applyGrade` 가 `FSRSValidationError` 로 던지고 — 홈·세션·리포트가 모두 재생을 부르므로
 * 화면 전체가 멈춘다. 실제로 그렇게 터지는 걸 확인하고 이 검사를 붙였다.
 */
describe('replay — 모르는 이벤트 타입', () => {
  /** 이 빌드가 모르는 미래의 타입. 일부러 타입 시스템 밖에서 만든다 */
  const unknownEvent = (at: number, idiomId: string): LearningEvent =>
    ({
      id: newEventId(at, () => 0.5), userId: 'local', deviceId: 'dev-future', at,
      idiomId, cardType: 'meaning', mistakeType: null, deletedAt: null,
      type: 'someFutureType',
    }) as unknown as LearningEvent

  it('던지지 않는다', () => {
    expect(() => replay([unknownEvent(T0, '9')])).not.toThrow()
  })

  it('카드를 만들지 않는다 — 채점으로 오해하면 안 된다', () => {
    const s = replay([unknownEvent(T0, '9')])
    expect(s.cards.size).toBe(0)
  })

  it('섞여 있어도 나머지 재생 결과가 그대로다', () => {
    const base = sampleEvents()
    const mixed = [...base, unknownEvent(T0 + 6 * DAY, '1')]
    const a = replay(base)
    const b = replay(mixed)
    expect(b.cards.size).toBe(a.cards.size)
    for (const [k, v] of a.cards) {
      expect(b.cards.get(k)?.wrong).toBe(v.wrong)
      expect(b.cards.get(k)?.card.due.getTime()).toBe(v.card.due.getTime())
    }
  })
})

describe('replay — 뜻 평가 (엄지)', () => {
  const vote = (
    at: number,
    idiomId: string,
    verdict: 'ok' | 'bad' | null,
    definition: string,
  ): LearningEvent => ({
    id: newEventId(at, () => 0.5), userId: 'local', deviceId: 'dev-a', at,
    idiomId, cardType: 'meaning', mistakeType: null, deletedAt: null,
    type: 'flag', verdict, definition, headword: '公庫',
  })

  it('판정과 표제어와 그때 본 뜻이 남는다', () => {
    const s = replay([vote(T0, '1', 'bad', '공공의 창고')])
    expect(s.meaningVotes.get('1')).toEqual({
      verdict: 'bad', headword: '公庫', definition: '공공의 창고',
    })
  })

  it('엄지 위도 같은 자리에 남는다', () => {
    expect(replay([vote(T0, '1', 'ok', '뜻')]).meaningVotes.get('1')?.verdict).toBe('ok')
  })

  it('반대 엄지를 누르면 덮어쓴다 — 마지막 이벤트가 이긴다', () => {
    const s = replay([vote(T0, '1', 'bad', '뜻'), vote(T0 + 1, '1', 'ok', '뜻')])
    expect(s.meaningVotes.get('1')?.verdict).toBe('ok')
  })

  it('null 이면 취소된다', () => {
    const s = replay([vote(T0, '1', 'ok', '뜻'), vote(T0 + 1, '1', null, '뜻')])
    expect(s.meaningVotes.has('1')).toBe(false)
  })

  /** 첫 배포분(2026-09-22 오전)은 「이상해요」뿐이라 `on: boolean` 이었다 */
  it('옛 모양(on: boolean)도 읽는다 — 로그는 append-only 라 지울 수 없다', () => {
    const legacy = (at: number, on: boolean): LearningEvent =>
      ({
        id: newEventId(at, () => 0.5), userId: 'local', deviceId: 'dev-a', at,
        idiomId: '1', cardType: 'meaning', mistakeType: null, deletedAt: null,
        type: 'flag', on, definition: '옛 뜻', headword: '公庫',
      }) as unknown as LearningEvent
    expect(replay([legacy(T0, true)]).meaningVotes.get('1')?.verdict).toBe('bad')
    expect(replay([legacy(T0, true), legacy(T0 + 1, false)]).meaningVotes.has('1')).toBe(false)
  })

  it('채점 상태를 안 건드린다 — 평가는 오답이 아니다', () => {
    const base = sampleEvents()
    const a = replay(base)
    const b = replay([...base, vote(T0 + 6 * DAY, '1', 'bad', '아무 뜻')])
    expect(b.cards.get(cardKey('1', 'reading'))?.wrong).toBe(
      a.cards.get(cardKey('1', 'reading'))?.wrong,
    )
    expect(b.cards.size).toBe(a.cards.size)
  })

  it('입력 순서가 달라도 같은 결과다 — 재생 결정론', () => {
    const evs = [vote(T0, '1', 'bad', 'A'), vote(T0 + 1, '1', null, 'A'), vote(T0 + 2, '2', 'ok', 'B')]
    const fwd = replay([...evs])
    const rev = replay([...evs].reverse())
    expect([...rev.meaningVotes.keys()]).toEqual([...fwd.meaningVotes.keys()])
  })
})
