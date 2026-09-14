// 소개 자리 배분 검증 (2026-09-13)
import { describe, expect, it } from 'vitest'
import { INTRO_MIN_READINGS, planIntros } from './planIntros.ts'
import type { SessionCard } from '../core/session.ts'

const card = (idiomId: string, cardType: 'reading' | 'meaning', due: boolean): SessionCard => ({
  idiomId,
  cardType,
  mode: due ? 'correction' : 'expansion',
  due,
  needsClassReview: false,
})

const none = () => false
/** 기본값 — 아무것도 풀어 본 적 없다 */
const fresh = () => false
/** 넉넉한 문제 수 — 상한에 안 걸리게 두고 다른 규칙을 본다 */
const LIMIT = 20
/** 기존 케이스는 이미 데이터가 쌓인 상태를 전제한다 */
const ENOUGH = INTRO_MIN_READINGS

describe('planIntros', () => {
  it('처음 만나는 숙어를 소개 대상으로 잡는다', () => {
    const plan = planIntros([card('a', 'reading', false)], none, fresh, ENOUGH, LIMIT)
    expect([...plan.introIds]).toEqual(['a'])
  })

  it('복습 기한 카드는 소개 대상이 아니다', () => {
    const plan = planIntros([card('a', 'reading', true)], none, fresh, ENOUGH, LIMIT)
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(1)
  })

  it('이미 소개한 숙어는 그냥 출제된다', () => {
    const plan = planIntros([card('a', 'reading', false)], (id) => id === 'a', fresh, ENOUGH, LIMIT)
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(1)
  })

  it('소개 대상은 한 장만 남는다 — 같은 세션에서 그 숙어를 묻지 않는다', () => {
    const plan = planIntros(
      [card('a', 'reading', false), card('a', 'meaning', false)], none, fresh, ENOUGH, LIMIT)
    expect(plan.cards).toHaveLength(1)
    expect(plan.cards[0].cardType).toBe('reading')
  })

  it('첫 등장 자리를 지킨다 — 순서를 안 흔든다', () => {
    const plan = planIntros([card('x', 'reading', true), card('a', 'meaning', false), card('a', 'reading', false)], none, fresh, ENOUGH, LIMIT)
    expect(plan.cards.map((c) => `${c.idiomId}:${c.cardType}`)).toEqual(['x:reading', 'a:meaning'])
  })

  it('한 숙어가 소개 대상이면 그 숙어의 기한 카드도 걷는다 — 같은 숙어를 두 번 안 낸다', () => {
    // 읽기·뜻이 둘 다 신규인데 한쪽만 소개 자리가 되는 일이 없어야 한다
    const plan = planIntros([card('a', 'reading', false), card('a', 'meaning', false)], none, fresh, ENOUGH, LIMIT)
    expect(plan.cards).toHaveLength(1)
    expect(plan.introIds.has('a')).toBe(true)
  })

  it('여러 숙어가 섞여도 각각 한 장씩', () => {
    const plan = planIntros(
      [
        card('a', 'reading', false), card('b', 'reading', true),
        card('a', 'meaning', false), card('c', 'reading', false),
        card('c', 'meaning', false), card('d', 'reading', true),
      ], none, fresh, ENOUGH, LIMIT)
    expect(plan.cards.map((c) => c.idiomId).sort()).toEqual(['a', 'b', 'c', 'd'])
    expect([...plan.introIds].sort()).toEqual(['a', 'c'])
  })

  it('소개할 게 없으면 카드가 그대로다', () => {
    const cards = [card('a', 'reading', true), card('b', 'meaning', true)]
    const plan = planIntros(cards, none, fresh, ENOUGH, LIMIT)
    expect(plan.cards).toEqual(cards)
  })
})

describe('데이터가 쌓이기 전에는 소개하지 않는다 (2026-09-13)', () => {
  const newCards = [card('a', 'reading', false), card('b', 'reading', false)]

  it('읽기 채점이 문턱 미만이면 소개가 없다 — 먼저 풀게 한다', () => {
    const plan = planIntros(newCards, none, fresh, INTRO_MIN_READINGS - 1, LIMIT)
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(2)
  })

  it('기록이 아예 없으면 당연히 없다', () => {
    expect(planIntros(newCards, none, fresh, 0, LIMIT).introIds.size).toBe(0)
  })

  it('문턱에 닿으면 그때부터 소개한다', () => {
    const plan = planIntros(newCards, none, fresh, INTRO_MIN_READINGS, LIMIT)
    expect([...plan.introIds].sort()).toEqual(['a', 'b'])
  })

  it('문턱 미만이어도 카드를 걷지 않는다 — 세션이 짧아지면 안 된다', () => {
    const both = [card('a', 'reading', false), card('a', 'meaning', false)]
    expect(planIntros(both, none, fresh, 0, LIMIT).cards).toHaveLength(2)
    expect(planIntros(both, none, fresh, INTRO_MIN_READINGS, LIMIT).cards).toHaveLength(1)
  })
})

describe('이미 푼 숙어는 소개하지 않는다 (2026-09-14)', () => {
  it('다른 카드 종류로 풀어 봤으면 소개 대상이 아니다 — due 는 카드 종류 단위다', () => {
    // 읽기로 푼 숙어의 뜻 카드가 처음 나오는 상황. due 만 보면 신규로 보인다
    const plan = planIntros(
      [card('a', 'meaning', false)], none, (id) => id === 'a', ENOUGH, LIMIT)
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(1)
  })

  it('기록이 있는 숙어와 없는 숙어가 섞이면 없는 쪽만 소개한다', () => {
    const cards = [
      card('old', 'meaning', false), card('new1', 'reading', false),
      card('new2', 'reading', false),
    ]
    const plan = planIntros(cards, none, (id) => id === 'old', ENOUGH, LIMIT)
    expect([...plan.introIds]).toEqual(['new1', 'new2'])
  })
})

describe('소개는 문제 수에 안 든다 (2026-09-14)', () => {
  const news = (n: number) =>
    Array.from({ length: n }, (_, i) => card(`n${i}`, 'reading', false))
  const olds = (n: number) =>
    Array.from({ length: n }, (_, i) => card(`o${i}`, 'reading', true))

  it('문제는 questionLimit 만큼 채운다 — 소개가 자리를 안 먹는다', () => {
    const plan = planIntros([...news(3), ...olds(10)], none, fresh, ENOUGH, 10)
    const questions = plan.cards.filter((c) => !plan.introIds.has(c.idiomId))
    expect(questions).toHaveLength(10)
    expect(plan.introIds.size).toBe(3)
    expect(plan.cards).toHaveLength(13)
  })

  it('상한은 문제 수의 3분의 1 이다', () => {
    const plan = planIntros([...news(20), ...olds(20)], none, fresh, ENOUGH, 9)
    expect(plan.introIds.size).toBe(3)
  })

  it('상한을 넘은 신규 숙어는 걷어내지 않고 그냥 출제한다', () => {
    const plan = planIntros(news(20), none, fresh, ENOUGH, 9)
    const questions = plan.cards.filter((c) => !plan.introIds.has(c.idiomId))
    expect(questions).toHaveLength(9)
    expect(plan.introIds.size).toBe(3)
  })

  it('앞에서부터 채운다 — 첫 등장 순서를 지킨다', () => {
    const plan = planIntros(news(20), none, fresh, ENOUGH, 9)
    expect([...plan.introIds]).toEqual(['n0', 'n1', 'n2'])
  })

  it('문제가 다 차면 거기서 끊는다 — 뒤에 남은 소개는 안 낸다', () => {
    const plan = planIntros([...olds(5), ...news(5)], none, fresh, ENOUGH, 3)
    expect(plan.cards).toHaveLength(3)
    expect(plan.introIds.size).toBe(0)
  })

  it('세션이 아주 짧아도 최소 한 장은 소개한다', () => {
    const plan = planIntros([...news(2), ...olds(2)], none, fresh, ENOUGH, 2)
    expect(plan.introIds.size).toBe(1)
  })
})

describe('소개를 문제 사이에 흩는다 (2026-09-14)', () => {
  const news = (n: number) =>
    Array.from({ length: n }, (_, i) => card(`n${i}`, 'reading', false))
  const olds = (n: number) =>
    Array.from({ length: n }, (_, i) => card(`o${i}`, 'reading', true))
  const shape = (cards: SessionCard[], introIds: ReadonlySet<string>) =>
    cards.map((c) => (introIds.has(c.idiomId) ? 'I' : 'Q')).join('')

  it('덩어리로 들어와도 흩어져 나온다 — 집중 세션은 신규가 연속이다', () => {
    // buildFocus 는 틀린 것 → 처음 보는 것 → 나머지 순이라 신규가 붙어 들어온다
    const plan = planIntros(
      [...olds(2), ...news(3), ...olds(10)], none, fresh, ENOUGH, 12)
    expect(shape(plan.cards, plan.introIds)).not.toContain('III')
    expect(plan.introIds.size).toBe(3)
  })

  it('첫 장은 문제다 — 설명부터 들이밀지 않는다', () => {
    const plan = planIntros([...news(3), ...olds(9)], none, fresh, ENOUGH, 9)
    expect(shape(plan.cards, plan.introIds).startsWith('Q')).toBe(true)
  })

  it('문제 순서는 안 흔든다 — 교정 우선과 표면형 대조가 거기 실려 있다', () => {
    const plan = planIntros(
      [...news(2), ...olds(6)], none, fresh, ENOUGH, 6)
    const questions = plan.cards.filter((c) => !plan.introIds.has(c.idiomId))
    expect(questions.map((c) => c.idiomId)).toEqual(['o0', 'o1', 'o2', 'o3', 'o4', 'o5'])
  })

  it('소개가 없으면 순서를 그대로 둔다', () => {
    const cards = olds(4)
    expect(planIntros(cards, none, fresh, ENOUGH, 4).cards).toEqual(cards)
  })
})
