// 모드 자동 배정 — 뜻을 물을 수 있는 숙어인가 (PLAN §6)
import { State, type Card } from 'ts-fsrs'
import { describe, expect, it } from 'vitest'
import { assignMode } from './mode.ts'

/** 뜻 카드 상태만 흉내 낸다. `assignMode` 는 state 와 stability 만 본다 */
const card = (state: State, stability = 1): Card =>
  ({ state, stability, difficulty: 5, due: new Date(), reps: 1 }) as unknown as Card

describe('3단계 배정', () => {
  it('1단계 — 동형동의(1)는 교정, 나머지는 확장', () => {
    expect(assignMode({ category: 1 }).mode).toBe('correction')
    expect(assignMode({ category: 2 }).mode).toBe('expansion')
  })

  it('2단계 — 진단 응답이 사전 분류를 이긴다', () => {
    expect(assignMode({ category: 2, meaningKnown: true })).toEqual({
      mode: 'correction',
      source: 'diagnostic',
    })
  })

  it('3단계 — 뜻이 붙으면 교정으로, 재학습이면 확장으로 되돌린다', () => {
    expect(assignMode({ category: 2, meaningCard: card(State.Review, 30) }).mode).toBe('correction')
    expect(assignMode({ category: 1, meaningCard: card(State.Relearning) }).mode).toBe('expansion')
  })
})

describe('뜻이 없으면 교정 모드 (2026-09-23)', () => {
  // 밴드 4 를 담아 세션에 넣을 수 있게 되면서 생긴 조건이다. 밴드 4 는 번역을 아직 안
  // 돌려 koMeaning 이 비어 있는데, 확장 모드로 보내면 뜻 카드가 「뜻을 떠올려 볼까요?」를
  // 묻고는 「뜻 미등록」을 보여 준다
  it('앞 단계가 확장으로 보내도 뜻이 없으면 교정이다', () => {
    expect(assignMode({ category: 2, hasMeaning: false })).toEqual({
      mode: 'correction',
      source: 'no-meaning',
    })
  })

  it('진단이 「뜻을 몰랐다」고 해도 마찬가지다 — 물을 것이 없다', () => {
    expect(assignMode({ category: 2, meaningKnown: false, hasMeaning: false }).mode).toBe(
      'correction',
    )
  })

  it('재학습 상태라도 뜻이 없으면 확장으로 못 보낸다', () => {
    expect(
      assignMode({ category: 1, meaningCard: card(State.Relearning), hasMeaning: false }).mode,
    ).toBe('correction')
  })

  it('**밴드가 아니라 뜻 유무로 가른다** — 채워지면 저절로 원래 규칙을 탄다', () => {
    expect(assignMode({ category: 2, hasMeaning: true }).mode).toBe('expansion')
    // 안 주면 있다고 본다. 옛 호출부(테스트·시뮬레이션)는 예전과 똑같이 돈다
    expect(assignMode({ category: 2 }).mode).toBe('expansion')
  })
})
