// 홈이 내밀 카드 고르기와 첫 장 당기기 검증 — 뜻 카드·처음 보는 표현이 안 뽑히는지, 접힌 표기도 당겨지는지
import { describe, expect, it } from 'vitest'
import { leadWith, pickHomeCard } from './homeCard.ts'
import { planIntros } from '../study/planIntros.ts'
import type { CardType } from './types.ts'

function card(idiomId: string, cardType: CardType, due: boolean) {
  return { idiomId, cardType, mode: 'correction' as const, due }
}

describe('pickHomeCard', () => {
  /** 숙어 id → 표기. c 는 a 와 같은 표기다 — 「읽기 둘」 짝꿍 */
  const hw: Record<string, string> = { a: '幻滅', b: '憂鬱', c: '幻滅' }
  const pick = (cards: ReturnType<typeof card>[], seen: string[] = []) =>
    pickHomeCard(cards, (id) => hw[id], new Set(seen))

  it('전에 본 읽기 카드를 고른다', () => {
    expect(pick([card('a', 'reading', true), card('b', 'reading', true)])).toBe('a')
  })

  it('뜻 카드는 고르지 않는다 — 묻는 게 다르다', () => {
    expect(pick([card('a', 'meaning', true), card('b', 'reading', true)])).toBe('b')
  })

  it('처음 보는 표현은 고르지 않는다 — 「모르겠다」로 끝난다', () => {
    expect(pick([card('a', 'reading', false), card('b', 'reading', true)])).toBe('b')
  })

  it('오늘 채점한 표기는 안 내민다', () => {
    expect(pick([card('a', 'reading', true), card('b', 'reading', true)], ['幻滅'])).toBe('b')
  })

  /**
   * 「읽기 둘」에서 쓰지 못한 쪽은 무기록이라 기한이 그대로다. 기록이 남은 건 짝꿍(a)뿐인데
   * 표기가 같으므로, 숙어 id 로 걸렀다면 c 가 그대로 올라와 같은 글자가 다시 섰을 것이다
   */
  it('같은 표기의 짝꿍만 채점했어도 그 표기를 안 내민다', () => {
    expect(pick([card('c', 'reading', true), card('b', 'reading', true)], ['幻滅'])).toBe('b')
  })

  it('고를 카드가 없으면 null — 그날은 「세션 시작」 그대로', () => {
    expect(pick([card('a', 'reading', false), card('b', 'meaning', true)])).toBeNull()
    expect(pick([card('a', 'reading', true)], ['幻滅'])).toBeNull()
    expect(pick([])).toBeNull()
  })
})

describe('leadWith', () => {
  const headwords: Record<string, string> = { a: '幻滅', b: '憂鬱', c: '幻滅' }
  const headwordOf = (id: string) => headwords[id]

  it('그 표기의 읽기 카드를 맨 앞으로 당긴다', () => {
    const cards = [card('b', 'reading', true), card('a', 'reading', true)]
    expect(leadWith(cards, headwordOf, '幻滅').map((c) => c.idiomId)).toEqual(['a', 'b'])
  })

  it('접혀서 대표 id 가 바뀌어도 표기로 찾는다', () => {
    const cards = [card('b', 'reading', true), card('c', 'reading', true)]
    expect(leadWith(cards, headwordOf, '幻滅').map((c) => c.idiomId)).toEqual(['c', 'b'])
  })

  it('그 표기의 읽기 카드가 없으면 순서를 그대로 둔다', () => {
    const cards = [card('b', 'reading', true), card('a', 'meaning', true)]
    expect(leadWith(cards, headwordOf, '幻滅').map((c) => c.idiomId)).toEqual(['b', 'a'])
  })

  it('이미 첫 장이면 그대로 둔다', () => {
    const cards = [card('a', 'reading', true), card('b', 'reading', true)]
    expect(leadWith(cards, headwordOf, '幻滅').map((c) => c.idiomId)).toEqual(['a', 'b'])
  })
})

/**
 * 당기는 자리는 **소개 배치보다 앞**이어야 한다 (2026-10-13). `planIntros` 가 상한으로
 * 자르므로, 뒤에서 당기면 상한 밖에 있던 미끼 카드가 이미 잘려 나가 세션에 없다.
 * 이 결정을 어기면 이 테스트가 막는다.
 */
describe('당기기와 소개 배치의 순서', () => {
  const LIMIT = 20
  const total = 30
  const ids = Array.from({ length: total }, (_, i) => `i${String(i).padStart(2, '0')}`)
  const headwordOf = (id: string) => `語${id}`
  const cards = ids.map((id) => ({ ...card(id, 'reading', true), needsClassReview: false }))
  /** 상한 밖에 있는 카드 — 홈은 자르기를 모르는 채로 이것을 내밀 수 있다 */
  const target = ids[total - 1]

  it('먼저 당기면 상한에 안 잘리고 첫 장이 된다', () => {
    const led = leadWith(cards, headwordOf, headwordOf(target))
    const plan = planIntros(led, () => false, () => true, 30, LIMIT)
    expect(plan.cards[0].idiomId).toBe(target)
  })

  it('나중에 당기면 그 카드가 이미 잘려 나가 있다', () => {
    const plan = planIntros(cards, () => false, () => true, 30, LIMIT)
    const led = leadWith(plan.cards, headwordOf, headwordOf(target))
    expect(led.some((c) => c.idiomId === target)).toBe(false)
    expect(led[0]?.idiomId).not.toBe(target)
  })
})
