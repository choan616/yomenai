// 소개 자리 배분 검증 (2026-09-13)
import { describe, expect, it } from 'vitest'
import { planIntros } from './planIntros.ts'
import type { SessionCard } from '../core/session.ts'

const card = (idiomId: string, cardType: 'reading' | 'meaning', due: boolean): SessionCard => ({
  idiomId,
  cardType,
  mode: due ? 'correction' : 'expansion',
  due,
  needsClassReview: false,
})

const none = () => false

describe('planIntros', () => {
  it('처음 만나는 숙어를 소개 대상으로 잡는다', () => {
    const plan = planIntros([card('a', 'reading', false)], none)
    expect([...plan.introIds]).toEqual(['a'])
  })

  it('복습 기한 카드는 소개 대상이 아니다', () => {
    const plan = planIntros([card('a', 'reading', true)], none)
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(1)
  })

  it('이미 소개한 숙어는 그냥 출제된다', () => {
    const plan = planIntros([card('a', 'reading', false)], (id) => id === 'a')
    expect(plan.introIds.size).toBe(0)
    expect(plan.cards).toHaveLength(1)
  })

  it('소개 대상은 한 장만 남는다 — 같은 세션에서 그 숙어를 묻지 않는다', () => {
    const plan = planIntros(
      [card('a', 'reading', false), card('a', 'meaning', false)],
      none,
    )
    expect(plan.cards).toHaveLength(1)
    expect(plan.cards[0].cardType).toBe('reading')
  })

  it('첫 등장 자리를 지킨다 — 순서를 안 흔든다', () => {
    const plan = planIntros(
      [card('x', 'reading', true), card('a', 'meaning', false), card('a', 'reading', false)],
      none,
    )
    expect(plan.cards.map((c) => `${c.idiomId}:${c.cardType}`)).toEqual(['x:reading', 'a:meaning'])
  })

  it('한 숙어가 소개 대상이면 그 숙어의 기한 카드도 걷는다 — 같은 숙어를 두 번 안 낸다', () => {
    // 읽기는 신규인데 뜻은 기한이 찬 경우. 소개에서 둘 다 보여주므로 묻지 않는다
    const plan = planIntros([card('a', 'reading', false), card('a', 'meaning', true)], none)
    expect(plan.cards).toHaveLength(1)
    expect(plan.introIds.has('a')).toBe(true)
  })

  it('여러 숙어가 섞여도 각각 한 장씩', () => {
    const plan = planIntros(
      [
        card('a', 'reading', false), card('b', 'reading', true),
        card('a', 'meaning', false), card('c', 'reading', false),
        card('c', 'meaning', false),
      ],
      none,
    )
    expect(plan.cards.map((c) => c.idiomId)).toEqual(['a', 'b', 'c'])
    expect([...plan.introIds].sort()).toEqual(['a', 'c'])
  })

  it('소개할 게 없으면 카드가 그대로다', () => {
    const cards = [card('a', 'reading', true), card('b', 'meaning', true)]
    const plan = planIntros(cards, none)
    expect(plan.cards).toEqual(cards)
  })
})
