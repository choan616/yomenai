// 「읽기 둘」 카드 — 짝 찾기와 세션 접기 (2026-09-14)
import { describe, expect, it } from 'vitest'
import { foldHomographs, pairOf, type HomographCandidate } from './homograph.ts'

const ICHIBA: HomographCandidate = { idiomId: '1308300', headword: '市場', reading: 'いちば' }
const SHIJOU: HomographCandidate = { idiomId: '1308305', headword: '市場', reading: 'しじょう' }
const GROUP = [ICHIBA, SHIJOU]

describe('pairOf', () => {
  // 답을 안 보고 표기만으로 정한다 — 순서에 따라 다르게 처리되면 안 된다 (2026-09-14)
  it('같은 표기를 쓰는 다른 숙어를 돌려준다', () => {
    expect(pairOf(SHIJOU, GROUP)).toEqual(ICHIBA)
    expect(pairOf(ICHIBA, GROUP)).toEqual(SHIJOU)
  })

  it('상대가 풀에 없으면 보통 카드다', () => {
    expect(pairOf(SHIJOU, [SHIJOU])).toBeUndefined()
    expect(pairOf(SHIJOU, undefined)).toBeUndefined()
  })
})

describe('foldHomographs', () => {
  const hw: Record<string, string> = {
    '1308300': '市場',
    '1308305': '市場',
    '9999': '学校',
  }
  const at = (idiomId: string, cardType: string) => ({ idiomId, cardType })

  it('같은 표기의 읽기 카드는 첫 장만 남는다', () => {
    const cards = [
      at('1308300', 'reading'),
      at('9999', 'reading'),
      at('1308305', 'reading'),
    ]
    expect(foldHomographs(cards, (id) => hw[id])).toEqual([
      at('1308300', 'reading'),
      at('9999', 'reading'),
    ])
  })

  // 뜻은 서로 다를 수 있다 — 읽기 카드만 접는다
  it('뜻 카드는 안 접는다', () => {
    const cards = [
      at('1308300', 'meaning'),
      at('1308305', 'meaning'),
    ]
    expect(foldHomographs(cards, (id) => hw[id])).toHaveLength(2)
  })

  it('풀에 없는 숙어는 건드리지 않는다', () => {
    const cards = [at('nope', 'reading'), at('nope2', 'reading')]
    expect(foldHomographs(cards, () => undefined)).toHaveLength(2)
  })
})
