// 홈이 내밀 카드 고르기와 첫 장 당기기 검증 — 뜻 카드·처음 보는 표현이 안 뽑히는지, 접힌 표기도 당겨지는지
import { describe, expect, it } from 'vitest'
import { leadWith, pickHomeCard } from './homeCard.ts'
import { planIntros } from '../study/planIntros.ts'
import type { CardType } from './types.ts'

function card(idiomId: string, cardType: CardType, due: boolean) {
  return { idiomId, cardType, mode: 'correction' as const, due }
}

describe('pickHomeCard', () => {
  it('전에 본 읽기 카드를 고른다', () => {
    const cards = [card('a', 'reading', true), card('b', 'reading', true)]
    expect(pickHomeCard(cards)).toBe('a')
  })

  it('뜻 카드는 고르지 않는다 — 묻는 게 다르다', () => {
    const cards = [card('a', 'meaning', true), card('b', 'reading', true)]
    expect(pickHomeCard(cards)).toBe('b')
  })

  it('처음 보는 표현은 고르지 않는다 — 「모르겠다」로 끝난다', () => {
    const cards = [card('a', 'reading', false), card('b', 'reading', true)]
    expect(pickHomeCard(cards)).toBe('b')
  })

  it('고를 카드가 없으면 null — 그날은 「세션 시작」 그대로', () => {
    expect(pickHomeCard([card('a', 'reading', false), card('b', 'meaning', true)])).toBeNull()
    expect(pickHomeCard([])).toBeNull()
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
