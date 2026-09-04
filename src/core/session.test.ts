// 조립 지점 검증 — 세션 구성, 답안 기록, 카드 풀 진입 시 지연 검수 신호
import { describe, expect, it } from 'vitest'
import { buildKoSiblingIndex, type MistakeContext } from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import { replay } from './replay.ts'
import {
  buildSession,
  isCorrectReading,
  recordMeaningAnswer,
  recordMeaningKnown,
  recordReadingAnswer,
  type ClassSource,
  type IdiomEntry,
} from './session.ts'
import type { Band } from '../lib/bands.ts'
import { cardKey, type KoreanCategory, type LearningEvent } from './types.ts'

const T0 = Date.UTC(2026, 0, 1)

const ctx = { userId: 'local', deviceId: 'dev-a', at: T0, elapsedMs: 1500, rand: () => 0.5 }
const mistakes: MistakeContext = {
  lookup: (k) => KANJI_FIXTURE[k],
  koSiblingOnyomi: buildKoSiblingIndex(KANJI_FIXTURE),
}

function entry(
  idiomId: string,
  category: KoreanCategory,
  classSource: ClassSource,
  band: Band = 1,
): IdiomEntry {
  return { idiomId, band, category, classSource, pairIds: [`${idiomId}:on:x`] }
}

const readingItem = { idiomId: '1', cardType: 'reading' as const, mode: 'correction' as const, due: false }
const meaningItem = { idiomId: '1', cardType: 'meaning' as const, mode: 'expansion' as const, due: false }

describe('isCorrectReading', () => {
  it('가타카나 입력과 앞뒤 공백을 정규화해서 비교한다', () => {
    expect(isCorrectReading('がっこう', 'がっこう')).toBe(true)
    expect(isCorrectReading('がっこう', ' ガッコウ ')).toBe(true)
    expect(isCorrectReading('がっこう', 'がくこう')).toBe(false)
  })

  it('빈 입력은 정답이 아니다', () => {
    expect(isCorrectReading('がっこう', '')).toBe(false)
    expect(isCorrectReading('がっこう', '   ')).toBe(false)
  })
})

describe('recordReadingAnswer', () => {
  it('정답이면 Good 등급에 오답 유형이 없다', () => {
    const e = recordReadingAnswer({
      item: readingItem, headword: '学校', reading: 'がっこう', answer: 'がっこう', ctx, mistakes,
    })
    expect(e).toMatchObject({ correct: true, grade: 3, mistakeType: null, cardType: 'reading' })
    expect(e.expected).toBe('がっこう')
  })

  it('오답이면 Again 등급에 유형이 붙는다', () => {
    const e = recordReadingAnswer({
      item: readingItem, headword: '学校', reading: 'がっこう', answer: 'がくこう', ctx, mistakes,
    })
    expect(e).toMatchObject({ correct: false, grade: 1, mistakeType: 'SOKUON' })
  })

  it('자신감 버튼은 정답일 때만 등급을 바꾼다', () => {
    const base = { item: readingItem, headword: '学校', reading: 'がっこう', ctx, mistakes }
    expect(recordReadingAnswer({ ...base, answer: 'がっこう', confidence: 'easy' }).grade).toBe(4)
    expect(recordReadingAnswer({ ...base, answer: 'がっこう', confidence: 'hard' }).grade).toBe(2)
    // 오답은 자신감과 무관하게 Again
    expect(recordReadingAnswer({ ...base, answer: 'がくこう', confidence: 'easy' }).grade).toBe(1)
  })

  it('스키마 불변 조건 필드를 다 채운다', () => {
    const e = recordReadingAnswer({
      item: readingItem, headword: '学校', reading: 'がっこう', answer: 'がくこう', ctx, mistakes,
    })
    expect(Object.keys(e)).toEqual(
      expect.arrayContaining(['userId', 'deviceId', 'deletedAt', 'cardType', 'mistakeType']),
    )
    expect(e.deletedAt).toBeNull()
    expect(e.userId).toBe('local')
  })
})

describe('recordMeaningAnswer / recordMeaningKnown', () => {
  it('뜻 카드는 자기 채점 결과를 그대로 받는다', () => {
    expect(recordMeaningAnswer({ item: meaningItem, correct: true, ctx }))
      .toMatchObject({ cardType: 'meaning', correct: true, grade: 3, mistakeType: null })
    expect(recordMeaningAnswer({ item: meaningItem, correct: false, ctx }).grade).toBe(1)
  })

  it('뜻 확인 응답은 채점 이벤트가 아니라 FSRS 카드를 만들지 않는다', () => {
    const known = recordMeaningKnown({ idiomId: '1', known: true, ctx })
    expect(known.type).toBe('meaningKnown')
    expect(replay([known]).cards.size).toBe(0)
    expect(replay([known]).meaningKnown.get('1')).toBe(true)
  })
})

describe('buildSession — 조립', () => {
  it('재생 → 모드 배정 → 선택을 한 번에 한다', () => {
    const pool = [entry('a', 1, 'manual'), entry('b', 2, 'manual')]
    const { cards, state } = buildSession(pool, [], { now: T0, limit: 10 })
    expect(state.applied).toBe(0)
    // 동형동의는 교정(읽기만), 동형이의는 확장(읽기+뜻)
    expect(cards.filter((c) => c.idiomId === 'a').map((c) => c.cardType)).toEqual(['reading'])
    expect(cards.filter((c) => c.idiomId === 'b').map((c) => c.cardType).sort())
      .toEqual(['meaning', 'reading'])
  })

  it('뜻 확인 응답이 미확정 분류를 덮어 모드를 바꾼다', () => {
    const pool = [entry('a', 2, 'llm')] // 초벌은 동형이의 = 확장
    const known = recordMeaningKnown({ idiomId: 'a', known: true, ctx })
    const before = buildSession(pool, [], { now: T0, limit: 10 })
    const after = buildSession(pool, [known], { now: T0, limit: 10 })
    expect(before.cards.map((c) => c.mode)).toContain('expansion')
    expect(after.cards.every((c) => c.mode === 'correction')).toBe(true)
  })
})

describe('buildSession — 지연 검수 신호 (Phase 3 에서 미룬 몫)', () => {
  it('미확정 분류(llm·default)가 처음 나오면 확인을 요구한다', () => {
    const pool = [entry('a', 1, 'llm'), entry('b', 1, 'default')]
    const { cards } = buildSession(pool, [], { now: T0, limit: 10 })
    expect(cards.every((c) => c.needsClassReview)).toBe(true)
  })

  it('사람이 확정한 분류(manual)는 묻지 않는다', () => {
    const { cards } = buildSession([entry('a', 1, 'manual')], [], { now: T0, limit: 10 })
    expect(cards.every((c) => !c.needsClassReview)).toBe(true)
  })

  it('한 세션에서 같은 숙어의 두 카드가 나와도 한 번만 묻는다', () => {
    const pool = [entry('a', 2, 'llm')] // 확장이라 읽기+뜻 두 장
    const { cards } = buildSession(pool, [], { now: T0, limit: 10 })
    expect(cards).toHaveLength(2)
    expect(cards.filter((c) => c.needsClassReview)).toHaveLength(1)
  })

  it('이미 확인을 받았으면 다시 묻지 않는다', () => {
    const pool = [entry('a', 1, 'llm')]
    const known = recordMeaningKnown({ idiomId: 'a', known: true, ctx })
    const { cards } = buildSession(pool, [known], { now: T0, limit: 10 })
    expect(cards.every((c) => !c.needsClassReview)).toBe(true)
  })

  it('복습으로 다시 나온 카드에는 안 묻는다 — 진입 시점 한 번뿐이다', () => {
    const pool = [entry('a', 1, 'llm')]
    const first = buildSession(pool, [], { now: T0, limit: 10 })
    const answered: LearningEvent[] = [
      recordReadingAnswer({
        item: first.cards[0], headword: '学校', reading: 'がっこう', answer: 'がくこう', ctx, mistakes,
      }),
    ]
    // 오답이라 곧 다시 기한이 돌아온다
    const later = buildSession(pool, answered, { now: T0 + 86_400_000, limit: 10 })
    expect(later.cards[0].due).toBe(true)
    expect(later.cards[0].needsClassReview).toBe(false)
  })
})

describe('buildSession → 기록 → 재생 왕복', () => {
  it('세션에서 나온 카드를 채점하면 다음 세션 상태에 반영된다', () => {
    const pool = [entry('a', 1, 'manual'), entry('b', 1, 'manual')]
    const first = buildSession(pool, [], { now: T0, limit: 10 })
    const events = first.cards.map((item, i) =>
      recordReadingAnswer({
        item, headword: '学校', reading: 'がっこう', answer: 'がっこう',
        ctx: { ...ctx, at: T0 + i * 10_000 }, mistakes,
      }),
    )
    expect(new Set(events.map((e) => e.id)).size, '이벤트 id 가 겹친다').toBe(events.length)
    const second = buildSession(pool, events, { now: T0, limit: 10 })
    expect(second.state.cards.size).toBe(events.length)
    for (const item of first.cards) {
      expect(second.state.cards.get(cardKey(item.idiomId, item.cardType))!.card.reps).toBe(1)
    }
    // 방금 맞힌 카드는 기한이 안 됐으니 다시 안 나온다
    expect(second.cards).toHaveLength(0)
  })
})
