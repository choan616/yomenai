// 세션 끝 예고 — 다음 세션에서 가장 자주 만날 음독 (Phase 11)
import { describe, expect, it } from 'vitest'
import { nextUp, NEXTUP_MIN_COUNT } from './nextUp.ts'
import type { OnyomiPair } from '../dict/load.ts'
import type { CardType } from './types.ts'

const pairs = new Map<string, OnyomiPair>([
  ['発:on:はつ', { kanji: '発', base: 'はつ', kind: 'on' }],
  ['達:on:たつ', { kanji: '達', base: 'たつ', kind: 'on' }],
  ['見:kun:み', { kanji: '見', base: 'み', kind: 'kun' }],
])

const of: Record<string, string[]> = {
  a: ['発:on:はつ', '達:on:たつ'],
  b: ['発:on:はつ', '見:kun:み'],
  c: ['発:on:はつ'],
  d: ['見:kun:み'],
}
const pairsOf = (id: string) => of[id] ?? []
const card = (idiomId: string, cardType: CardType = 'reading') => ({ idiomId, cardType })

describe('nextUp', () => {
  it('가장 자주 나오는 쌍을 낸다', () => {
    expect(nextUp([card('a'), card('b'), card('c')], pairsOf, pairs)).toEqual({
      pairId: '発:on:はつ',
      kanji: '発',
      base: 'はつ',
      kind: 'on',
      count: 3,
    })
  })

  it('뜻 카드는 안 센다 — 음독을 묻지 않는다', () => {
    // 읽기로는 見 2회 · 発 1회
    const cards = [card('d'), card('b'), card('a', 'meaning'), card('c', 'meaning')]
    expect(nextUp(cards, pairsOf, pairs)?.kanji).toBe('見')
  })

  it(`${NEXTUP_MIN_COUNT}회 미만이면 예고하지 않는다`, () => {
    expect(nextUp([card('c')], pairsOf, pairs)).toBeNull()
    expect(nextUp([], pairsOf, pairs)).toBeNull()
  })

  it('쌍 사전에 없는 id 는 무시한다', () => {
    const unknown = (id: string) => (id === 'x' ? ['謎:on:なぞ', '謎:on:なぞ'] : [])
    expect(nextUp([card('x'), card('x')], unknown, pairs)).toBeNull()
  })

  it('동점이면 pairId 오름차순 — 같은 입력이면 같은 예고가 나온다', () => {
    // 発 2회 · 見 2회 → '発:on:はつ' < '見:kun:み' (코드포인트)
    const r = nextUp([card('b'), card('b')], pairsOf, pairs)
    expect(r?.pairId).toBe('発:on:はつ')
  })
})
