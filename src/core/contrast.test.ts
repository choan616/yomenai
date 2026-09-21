// 형제 음독 찾기 — 대조 세션의 표적 (2026-09-21)
import { describe, expect, it } from 'vitest'
import { CONTRAST_MIN_IDIOMS, onyomiSiblings } from './contrast.ts'

/** 人 じん(많다) · にん(꽤 있다) · 훈독 ひと, 그리고 다른 한자 하나 */
const PAIRS = ['人:on:じん', '人:on:にん', '人:kun:ひと', '口:on:こう']
const COUNTS: Record<string, number> = {
  '人:on:じん': 158,
  '人:on:にん': 75,
  '人:kun:ひと': 40,
  '口:on:こう': 20,
}
const countOf = (id: string) => COUNTS[id] ?? 0

describe('onyomiSiblings', () => {
  it('같은 한자의 다른 음독을 낸다', () => {
    const s = onyomiSiblings('人:on:じん', PAIRS, countOf)
    expect(s.map((x) => x.base)).toEqual(['にん'])
    expect(s[0].idioms).toBe(75)
  })

  it('자기 자신은 안 낸다', () => {
    const s = onyomiSiblings('人:on:にん', PAIRS, countOf)
    expect(s.map((x) => x.pairId)).toEqual(['人:on:じん'])
  })

  it('훈독은 안 섞는다 — 대조가 아니라 혼독이 된다', () => {
    const s = onyomiSiblings('人:on:じん', PAIRS, countOf)
    expect(s.some((x) => x.pairId.includes(':kun:'))).toBe(false)
  })

  it('다른 한자는 안 섞는다', () => {
    expect(onyomiSiblings('口:on:こう', PAIRS, countOf)).toEqual([])
  })

  it('숙어가 임계 미만이면 뺀다 — 번갈아 낼 것이 없다', () => {
    const few = (id: string) => (id === '人:on:にん' ? CONTRAST_MIN_IDIOMS - 1 : countOf(id))
    expect(onyomiSiblings('人:on:じん', PAIRS, few)).toEqual([])
  })

  it('임계에 딱 걸리면 남는다', () => {
    const edge = (id: string) => (id === '人:on:にん' ? CONTRAST_MIN_IDIOMS : countOf(id))
    expect(onyomiSiblings('人:on:じん', PAIRS, edge)).toHaveLength(1)
  })

  it('훈독 쌍을 주면 형제를 안 찾는다 — 음독 대조에만 쓰는 장치다', () => {
    expect(onyomiSiblings('人:kun:ひと', PAIRS, countOf)).toEqual([])
  })

  it('숙어가 많은 순으로 세운다', () => {
    const three = ['行:on:こう', '行:on:ぎょう', '行:on:あん']
    const n = (id: string) => ({ '行:on:こう': 113, '行:on:ぎょう': 26, '行:on:あん': 5 })[id] ?? 0
    expect(onyomiSiblings('行:on:こう', three, n).map((x) => x.base)).toEqual(['ぎょう', 'あん'])
  })

  it('같은 쌍이 목록에 두 번 있어도 한 번만 낸다 — 풀에서 긁어 온 목록이라 중복이 온다', () => {
    const dup = [...PAIRS, '人:on:にん']
    expect(onyomiSiblings('人:on:じん', dup, countOf)).toHaveLength(1)
  })
})
