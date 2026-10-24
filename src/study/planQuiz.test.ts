// 환기 퀴즈 자리 배정(planQuiz)을 검증한다 (S4 ②)
import { describe, expect, it } from 'vitest'
import { QUICK_SESSION_LIMIT } from '../app/settings.ts'
import { buildHomophoneIndex, type QuizIdiom } from '../core/quiz.ts'
import type { SessionCard } from '../core/session.ts'
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

const card = (idiomId: string, due: boolean, cardType: 'reading' | 'meaning' = 'reading'): SessionCard => ({
  idiomId,
  cardType,
  mode: due ? 'correction' : 'expansion',
  due,
  needsClassReview: false,
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
  opts: Partial<{ introIds: Set<string>; kind: 'normal' | 'rematch' | 'focus'; limit: number; ids: string[]; seed: number }> = {},
) {
  const ids = opts.ids ?? [...new Set(cards.map((c) => c.idiomId))]
  return planQuiz({
    cards,
    introIds: opts.introIds ?? NONE,
    kind: opts.kind ?? 'normal',
    questionLimit: opts.limit ?? LIMIT,
    index: indexFor(ids),
    rand: rng(opts.seed ?? 1),
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

  it('맨 뒤 단독 신규 카드를 빼고 그 자리에 퀴즈가 선다 — 진행 분모는 그대로다', () => {
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

  it('소개 카드와 복습 카드는 빼지 않는다', () => {
    const cards = [card('d1', true), card('d2', true), card('i1', false), card('d3', true)]
    const p = plan(cards, { introIds: new Set(['i1']) })
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('신규 카드가 없으면(전부 복습) 퀴즈 없이 cards 그대로다', () => {
    const cards = [card('d1', true), card('d2', true), card('d3', true), card('d4', true)]
    const p = plan(cards)
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('신규가 둘짜리 숙어뿐이면 퀴즈 없이 cards 그대로다', () => {
    const cards = [card('d1', true), card('n1', false, 'reading'), card('d2', true), card('n1', false, 'meaning')]
    const p = plan(cards)
    expect(p.quiz).toBeNull()
    expect(p.cards).toEqual(cards)
  })

  it('맨 뒤 신규가 둘짜리면 앞쪽 단독 신규를 뺀다', () => {
    const cards = [
      card('d1', true),
      card('n1', false),
      card('d2', true),
      card('n2', false, 'reading'),
      card('d3', true),
      card('n2', false, 'meaning'),
    ]
    const p = plan(cards)
    expect(p.quiz).not.toBeNull()
    expect(p.cards.map((c) => c.idiomId)).not.toContain('n1')
    expect(p.cards.filter((c) => c.idiomId === 'n2')).toHaveLength(2)
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

  it('같은 난수면 결과가 같다', () => {
    const a = plan(base(), { seed: 7 })
    const b = plan(base(), { seed: 7 })
    expect(b).toEqual(a)
  })
})
