// 조립 지점 검증 — 세션 구성, 답안 기록, 카드 풀 진입 시 지연 검수 신호
import { describe, expect, it } from 'vitest'
import { buildKoSiblingIndex, type MistakeContext } from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import { replay } from './replay.ts'
import {
  buildFocus,
  buildRematch,
  buildSession,
  isCorrectReading,
  recordMeaningAnswer,
  recordMeaningKnown,
  recordReadingAnswer,
  rematchCount,
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

  // 동형이독 — 읽기 카드는 한자만 보여주므로 어느 쪽을 묻는지 알 수 없다 (2026-09-14)
  it('같은 표기의 다른 읽기도 정답으로 받는다', () => {
    const alts = ['いちば']
    expect(isCorrectReading('しじょう', 'いちば', alts)).toBe(true)
    expect(isCorrectReading('しじょう', 'イチバ', alts)).toBe(true)
  })

  it('alts 를 안 주면 예전 그대로 오답이다', () => {
    expect(isCorrectReading('しじょう', 'いちば')).toBe(false)
    expect(isCorrectReading('しじょう', 'いちば', [])).toBe(false)
  })

  it('빈 입력은 alts 가 있어도 정답이 아니다', () => {
    expect(isCorrectReading('しじょう', '', ['いちば'])).toBe(false)
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

  // 동형이독을 오답으로 세면 진단 리포트가 오염된다 (2026-09-14)
  it('같은 표기의 다른 읽기로 답해도 정답이고 오답 유형이 안 붙는다', () => {
    const e = recordReadingAnswer({
      item: readingItem, headword: '学校', reading: 'がっこう', answer: 'がくこう',
      altReadings: ['がくこう'], ctx, mistakes,
    })
    expect(e).toMatchObject({ correct: true, mistakeType: null })
    // 기록에는 이 카드가 물은 읽기가 그대로 남는다
    expect(e.expected).toBe('がっこう')
    expect(e.answer).toBe('がくこう')
  })

  // 이어 묻기가 맞힌 쪽 숙어에도 남기는 이벤트. 두 읽기는 처음부터 별도 숙어라
  // 스키마에 더할 것이 없다 — 세션에 없던 카드도 SessionItem 을 만들어 그대로 쓴다
  // 이어 묻기에서 방금 맞힌 다른 읽기를 또 쓴 경우. 오답이되 유형은 안 붙는다 —
  // 읽기를 잘못 고른 게 아니라 다른 쪽을 못 꺼낸 것이다 (2026-09-14)
  it('classify:false 면 오답이어도 유형이 안 붙는다', () => {
    const args = {
      item: readingItem, headword: '学校', reading: 'がっこう', answer: 'がくこう',
      ctx, mistakes,
    }
    // 같은 답인데 분류만 끈다 — 끄지 않으면 유형이 붙는 답이라야 시험이 된다
    expect(recordReadingAnswer(args).mistakeType).not.toBeNull()
    const e = recordReadingAnswer({ ...args, classify: false })
    expect(e).toMatchObject({ correct: false, mistakeType: null, answer: 'がくこう' })
  })

  it('상대 숙어에 남기는 정답 이벤트는 평범한 read 이벤트다', () => {
    const e = recordReadingAnswer({
      item: { idiomId: 'other-1', cardType: 'reading', mode: 'correction', due: false },
      headword: '学校', reading: 'がくこう', answer: 'がくこう', ctx, mistakes,
    })
    expect(e).toMatchObject({ idiomId: 'other-1', cardType: 'reading', correct: true, mistakeType: null })
    expect(e.expected).toBe('がくこう')
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

describe('buildRematch — 예전에 틀린 것만', () => {
  const pool = [entry('a', 1, 'manual'), entry('b', 1, 'manual'), entry('c', 1, 'manual')]

  /** 읽기 카드에 정답/오답을 순서대로 먹인다 */
  function history(idiomId: string, results: boolean[], at = T0): LearningEvent[] {
    return results.map((correct, i) =>
      recordReadingAnswer({
        item: { idiomId, cardType: 'reading', mode: 'correction', due: false },
        headword: '学校',
        reading: 'がっこう',
        answer: correct ? 'がっこう' : 'がくこう',
        ctx: { ...ctx, at: at + i * 60_000 },
        mistakes,
      }),
    )
  }

  it('틀린 적 있는 숙어만 낸다', () => {
    const events = [...history('a', [false]), ...history('b', [true], T0 + 3600_000)]
    const { cards } = buildRematch(pool, events, { now: T0 + 7200_000, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toEqual(['a'])
  })

  /** mulberry32 — 시드를 주면 같은 수열이 나와 통계 검증이 결정적이다 */
  function seeded(seed: number): () => number {
    let t = seed
    return () => {
      t += 0x6d2b79f5
      let r = Math.imul(t ^ (t >>> 15), 1 | t)
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
  }

  it('많이 틀린 숙어가 더 자주 뽑힌다 (가중 무작위)', () => {
    const events = [
      ...history('a', [false]),
      ...history('b', [false, false, false], T0 + 3600_000),
      ...history('c', [false, false], T0 + 7200_000),
    ]
    const rand = seeded(42)
    const drawn = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < 300; i++) {
      const { cards } = buildRematch(pool, events, { now: T0 + 10800_000, limit: 1, rand })
      drawn[cards[0].idiomId as 'a' | 'b' | 'c']++
    }
    // 가중치 3 : 2 : 1 — 순서가 지켜지고 적은 쪽도 꾸준히 나온다
    expect(drawn.b).toBeGreaterThan(drawn.c)
    expect(drawn.c).toBeGreaterThan(drawn.a)
    expect(drawn.a).toBeGreaterThan(0)
  })

  it('세션마다 조합이 달라진다 — 같은 카드만 반복되지 않는다', () => {
    const events = [
      ...history('a', [false]),
      ...history('b', [false], T0 + 3600_000),
      ...history('c', [false], T0 + 7200_000),
    ]
    const rand = seeded(7)
    const combos = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const { cards } = buildRematch(pool, events, { now: T0 + 10800_000, limit: 2, rand })
      combos.add(cards.map((c) => c.idiomId).sort().join(','))
    }
    expect(combos.size).toBeGreaterThan(1)
  })

  it('마지막 오답 이후 연속으로 맞히면 후보에서 빠진다', () => {
    const cleared = history('a', [false, true, true])
    expect(buildRematch(pool, cleared, { now: T0, limit: 10 }).cards).toEqual([])
    expect(rematchCount(pool, cleared)).toBe(0)

    // 한 번만 맞혔으면 아직 후보
    const notYet = history('b', [false, true])
    expect(buildRematch(pool, notYet, { now: T0, limit: 10 }).cards).toHaveLength(1)

    // 다시 틀리면 연속이 끊겨 후보로 돌아온다
    const relapsed = history('c', [false, true, true, false])
    expect(buildRematch(pool, relapsed, { now: T0, limit: 10 }).cards).toHaveLength(1)
  })

  it('기한을 무시한다 — 방금 맞힌 카드도 틀린 적 있으면 다시 낸다', () => {
    const events = history('a', [false, true])
    const { cards } = buildRematch(pool, events, { now: T0, limit: 10 })
    expect(cards).toHaveLength(1)
    expect(cards[0].due).toBe(false) // 기한 전인데도 나왔다
  })

  it('읽기 카드만 낸다', () => {
    const events = [
      ...history('a', [false]),
      recordMeaningAnswer({
        item: { idiomId: 'b', cardType: 'meaning', mode: 'expansion', due: false },
        correct: false,
        ctx,
      }),
    ]
    const { cards } = buildRematch(pool, events, { now: T0, limit: 10 })
    expect(cards.map((c) => c.cardType)).toEqual(['reading'])
  })

  it('확인 질문을 끼우지 않는다 — 이미 만난 숙어들이다', () => {
    const unconfirmed = [entry('a', 1, 'llm')]
    const { cards } = buildRematch(unconfirmed, history('a', [false]), { now: T0, limit: 10 })
    expect(cards.every((c) => !c.needsClassReview)).toBe(true)
  })

  it('limit 을 지킨다', () => {
    const events = [
      ...history('a', [false]),
      ...history('b', [false], T0 + 3600_000),
      ...history('c', [false], T0 + 7200_000),
    ]
    expect(buildRematch(pool, events, { now: T0, limit: 2 }).cards).toHaveLength(2)
  })

  it('풀에 없는 숙어는 건너뛴다', () => {
    const { cards } = buildRematch([entry('a', 1, 'manual')], history('zzz', [false]), {
      now: T0, limit: 10,
    })
    expect(cards).toEqual([])
  })

  it('틀린 게 없으면 빈 세션', () => {
    expect(buildRematch(pool, history('a', [true]), { now: T0, limit: 10 }).cards).toEqual([])
  })

  it('rematchCount 는 카드 수와 일치한다', () => {
    const events = [...history('a', [false]), ...history('b', [false, false], T0 + 3600_000)]
    expect(rematchCount(pool, events)).toBe(2)
    expect(buildRematch(pool, events, { now: T0, limit: 99 }).cards).toHaveLength(2)
  })

  it('분류에 실패한 오답도 센다 — mistakes 가 아니라 실제 오답 수를 본다', () => {
    // 'あいうえお' 는 어느 유형에도 안 맞아 mistakeType 이 null 이다
    const e = recordReadingAnswer({
      item: { idiomId: 'a', cardType: 'reading', mode: 'correction', due: false },
      headword: '学校',
      reading: 'がっこう',
      answer: 'あいうえお',
      ctx,
      mistakes,
    })
    expect(e.mistakeType).toBeNull()
    expect(e.correct).toBe(false)
    expect(rematchCount(pool, [e])).toBe(1)
  })
})

describe('buildFocus — 한 음독만 모은 집중 세션', () => {
  const PAIR = '発:on:はつ'
  /** 주어진 쌍들을 쓰는 숙어 */
  const withPairs = (idiomId: string, pairIds: string[]): IdiomEntry => ({
    idiomId, band: 1, category: 1, classSource: 'manual', pairIds,
  })
  const pool = [
    withPairs('a', [PAIR, '達:on:たつ']),
    withPairs('b', [PAIR, '見:on:けん']),
    withPairs('c', [PAIR, '表:on:ひょう']),
    withPairs('z', ['他:on:た']), // 그 쌍을 안 쓰는 숙어
  ]

  function history(idiomId: string, results: boolean[], at = T0): LearningEvent[] {
    return results.map((correct, i) =>
      recordReadingAnswer({
        item: { idiomId, cardType: 'reading', mode: 'correction', due: false },
        headword: '学校',
        reading: 'がっこう',
        answer: correct ? 'がっこう' : 'がくこう',
        ctx: { ...ctx, at: at + i * 60_000 },
        mistakes,
      }),
    )
  }

  it('그 쌍을 쓰는 숙어만 낸다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toEqual(['a', 'b', 'c'])
    expect(cards.every((c) => c.cardType === 'reading')).toBe(true)
  })

  it('아직 안 본 숙어도 넣는다 — "뚫으면 N개가 열린다"의 N 을 실제로 연다', () => {
    const { cards } = buildFocus(pool, history('a', [true, true]), {
      pairIds: [PAIR], now: T0, limit: 10,
    })
    expect(cards.map((c) => c.idiomId)).toContain('b')
    expect(cards.map((c) => c.idiomId)).toContain('c')
  })

  it('틀린 적 있는 것 → 안 본 것 → 맞히기만 한 것 순으로 세운다', () => {
    const events = [
      ...history('a', [true]), //           맞히기만 함
      ...history('c', [false], T0 + 3600_000), // 틀린 적 있음
      // b 는 기록 없음 (안 본 것)
    ]
    const { cards } = buildFocus(pool, events, { pairIds: [PAIR], now: T0 + 7200_000, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toEqual(['c', 'b', 'a'])
  })

  it('기한을 무시한다 — 방금 맞힌 카드도 나온다', () => {
    const { cards } = buildFocus(pool, history('a', [true]), { pairIds: [PAIR], now: T0, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toContain('a')
    expect(cards.find((c) => c.idiomId === 'a')!.due).toBe(false) // 기한 전인데도 나왔다
  })

  it('limit 을 넘지 않는다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 2 })
    expect(cards).toHaveLength(2)
  })

  it('확인 질문을 끼우지 않는다 — 지금 물어야 할 건 뜻이 아니라 이 음독이다', () => {
    const unconfirmed = [withPairs('a', [PAIR])].map((e) => ({ ...e, classSource: 'llm' as const }))
    const { cards } = buildFocus(unconfirmed, [], { pairIds: [PAIR], now: T0, limit: 10 })
    expect(cards.every((c) => !c.needsClassReview)).toBe(true)
  })

  it('해당 쌍을 쓰는 숙어가 없으면 빈 세션', () => {
    const { cards } = buildFocus(pool, [], { pairIds: ['無:on:む'], now: T0, limit: 10 })
    expect(cards).toHaveLength(0)
  })
})

describe('buildFocus — 대조 (표면형 번갈아)', () => {
  const PAIR = '学:on:がく'
  const withPairs = (idiomId: string, pairIds: string[]): IdiomEntry => ({
    idiomId, band: 1, category: 1, classSource: 'manual', pairIds,
  })
  // p1~p3 은 표면형 'がく', q1~q2 는 'がっ' 라고 본다
  const pool = ['p1', 'p2', 'p3', 'q1', 'q2'].map((id) => withPairs(id, [PAIR]))
  const surfaceOf = (id: string) => (id.startsWith('q') ? 'がっ' : 'がく')

  it('표면형 그룹 사이를 번갈아 낸다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 10, surfaceOf })
    expect(cards.map((c) => c.idiomId)).toEqual(['p1', 'q1', 'p2', 'q2', 'p3'])
  })

  it('자르기 전에 섞으므로 짧은 세션에도 양쪽이 들어온다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 2, surfaceOf })
    expect(cards.map((c) => c.idiomId)).toEqual(['p1', 'q1'])
  })

  it('표면형이 하나뿐이면 순서를 안 흔든다', () => {
    const flat = () => 'がく'
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 10, surfaceOf: flat })
    expect(cards.map((c) => c.idiomId)).toEqual(['p1', 'p2', 'p3', 'q1', 'q2'])
  })

  it('surfaceOf 를 안 주면 예전 정렬 그대로다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [PAIR], now: T0, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toEqual(['p1', 'p2', 'p3', 'q1', 'q2'])
  })
})

describe('buildFocus — 한 한자의 음독 둘을 갈라 내는 대조 세션 (2026-09-21)', () => {
  const JIN = '人:on:じん'
  const NIN = '人:on:にん'
  const withPairs = (idiomId: string, pairIds: string[]): IdiomEntry => ({
    idiomId, band: 1, category: 1, classSource: 'manual', pairIds,
  })
  // j1~j3 은 じん, n1~n2 는 にん, z 는 人 을 안 쓴다
  const pool = [
    withPairs('j1', [JIN, '口:on:こう']),
    withPairs('j2', [JIN, '生:on:せい']),
    withPairs('j3', [JIN, '類:on:るい']),
    withPairs('n1', [NIN, '間:on:かん']),
    withPairs('n2', [NIN, '気:on:き']),
    withPairs('z', ['他:on:た']),
  ]
  /** 실제로는 `surfaceOfPairs` 가 낸다 — 여기선 쌍마다 표면형이 다르다는 것만 세운다 */
  const surfaceOf = (id: string) => (id.startsWith('n') ? 'にん' : 'じん')

  it('두 쌍을 쓰는 숙어를 다 모은다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [JIN, NIN], now: T0, limit: 10 })
    expect(cards.map((c) => c.idiomId)).toEqual(['j1', 'j2', 'j3', 'n1', 'n2'])
  })

  it('음독이 번갈아 나온다 — 한쪽만 반복하면 "人 은 じん" 을 가르치게 된다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [JIN, NIN], now: T0, limit: 10, surfaceOf })
    expect(cards.map((c) => c.idiomId)).toEqual(['j1', 'n1', 'j2', 'n2', 'j3'])
  })

  it('한쪽만 틀렸어도 짧은 세션에 양쪽이 들어온다 — 대조가 목적이다', () => {
    const wrong = [
      ...['j1', 'j2', 'j3'].flatMap((id) =>
        [false].map(() =>
          recordReadingAnswer({
            item: { idiomId: id, cardType: 'reading', mode: 'correction', due: false },
            headword: '学校', reading: 'がっこう', answer: 'がくこう',
            ctx: { ...ctx, at: T0 }, mistakes,
          }),
        ),
      ),
    ]
    const { cards } = buildFocus(pool, wrong, { pairIds: [JIN, NIN], now: T0, limit: 4, surfaceOf })
    expect(cards.map((c) => c.idiomId)).toEqual(['j1', 'n1', 'j2', 'n2'])
  })

  it('쌍 하나만 주면 예전 집중 세션 그대로다', () => {
    const { cards } = buildFocus(pool, [], { pairIds: [JIN], now: T0, limit: 10, surfaceOf })
    expect(cards.map((c) => c.idiomId)).toEqual(['j1', 'j2', 'j3'])
  })
})
