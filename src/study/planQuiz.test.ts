// 환기 퀴즈 자리 배정(planQuiz)을 검증한다 (S4 ②)
import { describe, expect, it } from 'vitest'
import { QUICK_SESSION_LIMIT } from '../app/settings.ts'
import { buildHomophoneIndex, type QuizIdiom } from '../core/quiz.ts'
import type { SessionCard } from '../core/session.ts'
import { leadWith } from '../core/homeCard.ts'
import { foldHomographs } from './homograph.ts'
import { INTRO_MIN_READINGS, planIntros } from './planIntros.ts'
import { planQuiz } from './planQuiz.ts'

/** mulberry32 — quiz.test.ts 와 같은 재현 가능한 난수 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const card = (
  idiomId: string,
  due: boolean,
  cardType: 'reading' | 'meaning' = 'reading',
  rank?: number,
): SessionCard => ({
  idiomId,
  cardType,
  mode: due ? 'correction' : 'expansion',
  due,
  needsClassReview: false,
  ...(rank === undefined ? {} : { rank }),
})

/** 숙어마다 읽기가 다르고, 읽기마다 뜻이 겹치지 않는 동음이의 둘이 딸린 사전 */
function dictFor(ids: readonly string[]): QuizIdiom[] {
  const out: QuizIdiom[] = []
  ids.forEach((id, k) => {
    const reading = String.fromCharCode(0x3042 + k * 2)
    const def = (tag: string) => ({ definition: `${id}${tag}`, source: 'llm' as const, verified: false })
    out.push({ idiomId: id, headword: `${id}#`, reading, koMeaning: def('뜻') })
    out.push({ idiomId: `${id}-p`, headword: `${id}$`, reading, koMeaning: def('짝1') })
    out.push({ idiomId: `${id}-q`, headword: `${id}%`, reading, koMeaning: def('짝2') })
  })
  return out
}

const indexFor = (ids: readonly string[]) => buildHomophoneIndex(dictFor(ids))
const NONE = new Set<string>()
const LIMIT = QUICK_SESSION_LIMIT + 5

function plan(
  cards: SessionCard[],
  opts: Partial<{ introIds: Set<string>; kind: 'normal' | 'rematch' | 'focus'; limit: number; ids: string[]; seed: number; learned: string[] }> = {},
) {
  const ids = opts.ids ?? [...new Set(cards.map((c) => c.idiomId))]
  return planQuiz({
    cards,
    introIds: opts.introIds ?? NONE,
    kind: opts.kind ?? 'normal',
    questionLimit: opts.limit ?? LIMIT,
    index: indexFor(ids),
    rand: rng(opts.seed ?? 1),
    learned: opts.learned,
  })
}

describe('planQuiz', () => {
  const base = () => [
    card('d1', true),
    card('n1', false),
    card('d2', true),
    card('n2', false),
    card('d3', true),
    card('n3', false),
    card('d4', true),
    card('n4', false),
  ]

  it('rank 가 없으면 맨 뒤 단독 카드를 빼고 그 자리에 퀴즈가 선다 — 진행 분모는 그대로다', () => {
    const cards = base()
    const p = plan(cards)
    expect(p.quiz).not.toBeNull()
    expect(p.cards.length + 1).toBe(cards.length)
    expect(p.cards.map((c) => c.idiomId)).not.toContain('n4')
    expect(p.cards.filter((c) => c.due)).toHaveLength(cards.filter((c) => c.due).length)
    expect(p.quiz!.questions).toHaveLength(2)
    // 남은 7장의 절반(올림) 4장 다음
    expect(p.quiz!.at).toBe(4)
  })

  it('at 은 소개 카드를 문제 수에 세지 않는다', () => {
    const cards = [card('i1', false), ...base()]
    const p = plan(cards, { introIds: new Set(['i1']) })
    // 문제 7장 → 4번째 문제 다음. 앞의 소개 한 장 때문에 인덱스는 5
    expect(p.quiz!.at).toBe(5)
  })

  // 사용자 결정 2026-10-24 「복습 한 장 양보」 — 신규가 전부 소개이고 나머지가 복습인 세션(실제 기록)에서도 선다
  it('신규가 전부 소개이고 나머지가 복습이어도 퀴즈가 서고, rank 최대인 복습이 빠진다', () => {
    // 자리 순서는 섞여 있다 — 우선순위는 rank 다. rank 최대는 d3
    const cards = [
      card('d1', true, 'reading', 3),
      card('i1', false, 'reading', 20),
      card('d2', true, 'reading', 0),
      card('d3', true, 'reading', 9),
      card('i2', false, 'reading', 21),
      card('d4', true, 'reading', 5),
      card('d5', true, 'reading', 1),
      card('d6', true, 'reading', 2),
    ]
    const p = plan(cards, { introIds: new Set(['i1', 'i2']) })
    expect(p.quiz).not.toBeNull()
    expect(p.cards.map((c) => c.idiomId)).toEqual(['d1', 'i1', 'd2', 'i2', 'd4', 'd5', 'd6'])
    expect(p.cards.length + 1).toBe(cards.length)
  })

  it('소개 카드는 rank 가 가장 커도 빼지 않는다', () => {
    const cards = [
      card('d1', true, 'reading', 0),
      card('d2', true, 'reading', 1),
      card('i1', false, 'reading', 99),
      card('d3', true, 'reading', 2),
      card('d4', true, 'reading', 3),
      card('d5', true, 'reading', 4),
    ]
    const p = plan(cards, { introIds: new Set(['i1']) })
    expect(p.quiz).not.toBeNull()
    expect(p.cards.map((c) => c.idiomId)).toEqual(['d1', 'd2', 'i1', 'd3', 'd4'])
  })

  it('소개 카드뿐이면(첫 장 제외) 뺄 카드가 없어 퀴즈 없이 cards 그대로다', () => {
    const cards = [card('d1', true, 'reading', 0), card('i1', false, 'reading', 1), card('i2', false, 'reading', 2)]
    const p = plan(cards, { introIds: new Set(['i1', 'i2']) })
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('첫 장은 rank 가 가장 커도 빼지 않는다 — 홈이 내민 카드다', () => {
    const cards = base().map((c, i) => ({ ...c, rank: i === 0 ? 99 : i }))
    const p = plan(cards)
    expect(p.quiz).not.toBeNull()
    expect(p.cards[0]!.idiomId).toBe('d1')
    expect(p.cards.map((c) => c.idiomId)).not.toContain('n4')
  })

  it('단독 카드가 둘짜리보다 먼저 빠진다 — 둘짜리의 rank 가 더 커도', () => {
    const cards = [
      card('d1', true, 'reading', 0),
      card('n1', false, 'reading', 1),
      card('d2', true, 'reading', 2),
      card('n2', false, 'reading', 8),
      card('d3', true, 'reading', 3),
      card('n2', false, 'meaning', 9),
    ]
    const p = plan(cards)
    expect(p.quiz).not.toBeNull()
    expect(p.cards.map((c) => c.idiomId)).not.toContain('d3')
    expect(p.cards.filter((c) => c.idiomId === 'n2')).toHaveLength(2)
  })

  it('단독이 없으면 둘짜리의 rank 최대 한 장이 빠지고, 남은 한 장은 그대로다', () => {
    const cards = [
      card('x', true, 'reading', 0),
      card('x', true, 'meaning', 1),
      card('a', true, 'reading', 2),
      card('a', true, 'meaning', 3),
      card('b', true, 'reading', 4),
      card('c', true, 'reading', 5),
      card('b', true, 'meaning', 9),
      card('c', true, 'meaning', 6),
    ]
    const p = plan(cards)
    expect(p.quiz).not.toBeNull()
    expect(p.cards.map((c) => [c.idiomId, c.cardType])).toEqual([
      ['x', 'reading'],
      ['x', 'meaning'],
      ['a', 'reading'],
      ['a', 'meaning'],
      ['b', 'reading'],
      ['c', 'reading'],
      ['c', 'meaning'],
    ])
    // 뺀 숙어 b 는 퀴즈의 정답·보기에 안 나온다
    const shown = p.quiz!.questions.flatMap((q) => [q.targetId, ...q.options.map((o) => o.idiomId)])
    expect(shown).not.toContain('b')
  })

  it('복습뿐이어도 퀴즈를 못 세우면(문항 부족) 아무 카드도 안 빠진다', () => {
    const cards = [card('d1', true, 'reading', 0), card('d2', true, 'reading', 1), card('d3', true, 'reading', 2), card('d4', true, 'reading', 3)]
    const p = planQuiz({
      cards,
      introIds: NONE,
      kind: 'normal',
      questionLimit: LIMIT,
      index: indexFor([]),
      rand: rng(1),
    })
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('normal 이 아닌 세션(rematch·focus)은 퀴즈가 없다', () => {
    for (const kind of ['rematch', 'focus'] as const) {
      const cards = base()
      const p = plan(cards, { kind })
      expect(p.quiz).toBeNull()
      expect(p.cards).toEqual(cards)
    }
  })

  it('빠른 세션 장수 이하에서는 퀴즈가 없다', () => {
    expect(plan(base(), { limit: QUICK_SESSION_LIMIT }).quiz).toBeNull()
    expect(plan(base(), { limit: QUICK_SESSION_LIMIT + 1 }).quiz).not.toBeNull()
  })

  it('문제 카드가 한 장 남으면 끝자리가 되므로 퀴즈를 안 낸다', () => {
    const cards = [card('d1', true), card('n1', false)]
    expect(plan(cards).quiz).toBeNull()
  })

  it('문항이 2개 못 만들어지면 퀴즈 없이 cards 그대로다', () => {
    const cards = base()
    // 사전에 동음이의가 있는 숙어가 하나뿐이다
    const p = planQuiz({
      cards,
      introIds: NONE,
      kind: 'normal',
      questionLimit: LIMIT,
      index: indexFor(['d3']),
      rand: rng(1),
    })
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('문항 후보는 퀴즈 앞에 나온 숙어를 가까운 것부터 쓴다', () => {
    const p = plan(base())
    // rest = d1 n1 d2 n2 d3 n3 d4, at 4 → 바로 앞부터 n2, d2
    expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['n2', 'd2'])
  })

  it('뒤에 카드가 남은 숙어는 후보가 못 되고, 앞쪽으로 문항이 안 되면 퀴즈가 없다', () => {
    // 앞쪽(d1 n1 d2 n2)은 사전에 동음이의가 없고 뒤쪽(d3 n3 d4)에만 있다 — 뒤쪽 폴백은 없다
    const cards = base()
    const p = planQuiz({
      cards,
      introIds: NONE,
      kind: 'normal',
      questionLimit: LIMIT,
      index: indexFor(['d3', 'n3', 'd4']),
      rand: rng(1),
    })
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('앞쪽 숙어라도 뒤에 짝 카드(뜻 카드)가 남으면 후보에서 빠진다', () => {
    const cards = [
      card('d1', true),
      card('d2', true),
      card('n2', false, 'reading'),
      card('d3', true),
      card('d4', true),
      card('n2', false, 'meaning'),
      card('n5', false),
    ]
    const p = plan(cards)
    // n5 가 빠지고 남은 6장 → at 3. 바로 앞 n2 는 뜻 카드가 뒤에 남아 건너뛴다
    expect(p.quiz!.at).toBe(3)
    expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['d2', 'd1'])
    for (const q of p.quiz!.questions) expect(q.options.map((o) => o.idiomId)).not.toContain('n2')
  })

  it('동형이독 짝은 표기 단위로 가린다 — 뒤에 남은 「읽기 둘」 카드의 답이 미리 드러나지 않게', () => {
    const def = (t: string) => ({ definition: t, source: 'llm' as const, verified: false })
    const mk = (id: string, headword: string, reading: string): QuizIdiom => ({
      idiomId: id,
      headword,
      reading,
      koMeaning: def(`${id}뜻`),
    })
    // h-a·h-b 는 표기가 같고 읽기가 다르다(早々 はやばや·そうそう). h-b 카드가 퀴즈 뒤에 남는다
    const dict = [
      mk('d1', 'D1', 'あ'),
      mk('a1', 'A1', 'あ'),
      mk('a2', 'A2', 'あ'),
      mk('h-a', '早々', 'あ'),
      mk('h-b', '早々', 'い'),
      mk('d3', 'D3', 'う'),
      mk('u1', 'U1', 'う'),
      mk('u2', 'U2', 'う'),
      mk('d2', 'D2', 'え'),
      mk('d4', 'D4', 'お'),
    ]
    const cards = [
      card('d1', true, 'reading', 1),
      card('d2', true, 'reading', 9), // rank 최대 — 이 카드가 빠지고 그 자리에 퀴즈가 선다
      card('d3', true, 'reading', 2),
      card('d4', true, 'reading', 3),
      card('h-b', false, 'reading', 0),
    ]
    const p = planQuiz({
      cards,
      introIds: NONE,
      kind: 'normal',
      questionLimit: LIMIT,
      index: buildHomophoneIndex(dict),
      rand: rng(1),
    })
    expect(p.quiz!.questions).toHaveLength(2)
    const shown = p.quiz!.questions.flatMap((q) => [q.targetId, ...q.options.map((o) => o.idiomId)])
    expect(shown).not.toContain('h-a') // idiomId 로만 가리면 여기서 早々 가 새어 나온다
    expect(shown).not.toContain('h-b')
  })

  it('뒤에 카드가 남은 숙어와 뺀 카드의 숙어는 오답 보기에도 안 나온다', () => {
    // n2·d1 은 앞쪽 후보. n2 의 동음이의 무리에 뒤쪽 숙어(d3)와 뺀 카드의 숙어(n4)가 끼어 있다
    const def = (t: string) => ({ definition: t, source: 'llm' as const, verified: false })
    const mk = (id: string, reading: string): QuizIdiom => ({
      idiomId: id,
      headword: `${id}#`,
      reading,
      koMeaning: def(`${id}뜻`),
    })
    const index = buildHomophoneIndex([
      mk('n2', 'あ'),
      mk('d3', 'あ'),
      mk('n4', 'あ'),
      mk('x1', 'あ'),
      mk('x2', 'あ'),
      mk('d1', 'い'),
      mk('y1', 'い'),
      mk('y2', 'い'),
    ])
    for (let seed = 1; seed <= 20; seed++) {
      const p = planQuiz({
        cards: base(),
        introIds: NONE,
        kind: 'normal',
        questionLimit: LIMIT,
        index,
        rand: rng(seed),
      })
      expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['n2', 'd1'])
      const shown = p.quiz!.questions.flatMap((q) => q.options.map((o) => o.idiomId))
      expect(shown).not.toContain('d3')
      expect(shown).not.toContain('n4')
    }
  })

  it('뒤에 카드가 없는 소개 숙어는 후보가 될 수 있다', () => {
    const cards = [card('i1', false), card('d1', true), card('n1', false), card('d2', true), card('n2', false), card('d3', true), card('n3', false)]
    // n3 가 빠지고 문제 5장 → 3번째 문제(d2) 다음이 at(4). 앞쪽은 i1 d1 n1 d2
    const p = plan(cards, { introIds: new Set(['i1']), ids: ['i1', 'd1'] })
    expect(p.quiz!.at).toBe(4)
    expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['d1', 'i1'])
  })

  it('leadWith·foldHomographs·planIntros 를 지나도 rank 가 카드를 따라간다', () => {
    const raw = ['a', 'b', 'c', 'd', 'e', 'new'].map((id, i) => card(id, id !== 'new', 'reading', i))
    const headword = (id: string) => `${id}#`
    const led = leadWith(raw, headword, 'c#')
    const folded = foldHomographs(led, headword)
    const plan = planIntros(folded, () => false, () => false, INTRO_MIN_READINGS, 20)
    expect(plan.introIds.has('new')).toBe(true)
    const rankOf = Object.fromEntries(plan.cards.map((c) => [c.idiomId, c.rank]))
    expect(rankOf).toEqual({ a: 0, b: 1, c: 2, d: 3, e: 4, new: 5 })
    expect(plan.cards[0]!.idiomId).toBe('c')
  })

  describe('learned — 예전에 푼 표현으로 문항 채우기', () => {
    // base() 의 앞쪽 후보(가까운 순)는 n2 d2 n1 d1 — 사전에 넣은 것만 문항이 된다
    it('세션 카드에서 문항이 없으면 learned 가 최근에 푼 것부터 채운다', () => {
      const p = plan(base(), { ids: ['L1', 'L2', 'L3'], learned: ['L2', 'L1', 'L3'] })
      expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['L2', 'L1'])
      expect(p.cards.length + 1).toBe(base().length)
    })

    it('세션 카드에서 문항이 하나뿐이면 나머지 하나를 learned 로 채운다', () => {
      const p = plan(base(), { ids: ['n2', 'L1', 'L2'], learned: ['L1', 'L2'] })
      expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['n2', 'L1'])
    })

    it('세션 카드에서 문항이 둘 나오면 learned 는 안 쓴다', () => {
      const p = plan(base(), { ids: ['n2', 'd2', 'L1'], learned: ['L1'] })
      expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['n2', 'd2'])
    })

    it('learned 가 없거나 비면 지금과 같다 — 재료가 모자라면 퀴즈가 없다', () => {
      const ids = { ids: ['L1', 'L2'] }
      for (const learned of [undefined, []]) {
        const p = plan(base(), { ...ids, learned })
        expect(p.quiz).toBeNull()
        expect(p.cards).toEqual(base())
      }
      expect(plan(base(), { seed: 7, learned: [] })).toEqual(plan(base(), { seed: 7 }))
    })

    it('세션에 카드가 있는 숙어(퀴즈 뒤·뺀 카드)는 learned 에 있어도 정답·보기에서 빠진다', () => {
      const def = (t: string) => ({ definition: t, source: 'llm' as const, verified: false })
      const mk = (id: string, reading: string): QuizIdiom => ({
        idiomId: id,
        headword: `${id}#`,
        reading,
        koMeaning: def(`${id}뜻`),
      })
      const index = buildHomophoneIndex([
        mk('L1', 'あ'),
        mk('d3', 'あ'), // 퀴즈 뒤에 카드가 남은 숙어
        mk('n4', 'あ'), // 뺀 카드의 숙어
        mk('x1', 'あ'),
        mk('x2', 'あ'),
        mk('L2', 'い'),
        mk('y1', 'い'),
        mk('y2', 'い'),
      ])
      for (let seed = 1; seed <= 20; seed++) {
        const p = planQuiz({
          cards: base(),
          introIds: NONE,
          kind: 'normal',
          questionLimit: LIMIT,
          index,
          rand: rng(seed),
          learned: ['d3', 'n4', 'L1', 'L2'],
        })
        expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['L1', 'L2'])
        const shown = p.quiz!.questions.flatMap((q) => q.options.map((o) => o.idiomId))
        expect(shown).not.toContain('d3')
        expect(shown).not.toContain('n4')
      }
    })

    it('앞쪽 세션 카드와 겹치는 learned 는 중복 후보가 되지 않는다', () => {
      // n2 는 세션 앞쪽에도 learned 에도 있다 — 한 문항만 되고 둘째는 L1
      const p = plan(base(), { ids: ['n2', 'L1'], learned: ['n2', 'L1'] })
      expect(p.quiz!.questions.map((q) => q.targetId)).toEqual(['n2', 'L1'])
    })
  })

  it('같은 난수면 결과가 같다', () => {
    const a = plan(base(), { seed: 7 })
    const b = plan(base(), { seed: 7 })
    expect(b).toEqual(a)
  })
})
