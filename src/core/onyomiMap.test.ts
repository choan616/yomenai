// 음독 맵 파생 검증 — 숙달/학습중/미학습 분류와 정렬, 요약 집계
import { describe, expect, it } from 'vitest'
import type { OnyomiPair } from '../dict/load.ts'
import type { ReplayState } from './replay.ts'
import { pairRows, summarize } from './onyomiMap.ts'

const pairs = new Map<string, OnyomiPair>([
  ['A:on:あ', { kanji: 'A', base: 'あ', kind: 'on' }],
  ['B:on:い', { kanji: 'B', base: 'い', kind: 'on' }],
  ['C:on:う', { kanji: 'C', base: 'う', kind: 'on' }],
  ['D:kun:え', { kanji: 'D', base: 'え', kind: 'kun' }],
])

function state(onyomi: Record<string, { seen: number; wrong: number }>): ReplayState {
  return {
    cards: new Map(),
    meaningKnown: new Map(),
    onyomi: new Map(Object.entries(onyomi).map(([k, v]) => [k, { pairId: k, ...v }])),
    applied: 0,
  }
}

describe('pairRows', () => {
  const rows = pairRows(
    ['A:on:あ', 'B:on:い', 'C:on:う', 'D:kun:え', 'A:on:あ'],
    pairs,
    state({
      'A:on:あ': { seen: 5, wrong: 0 }, // 숙달
      'B:on:い': { seen: 4, wrong: 3 }, // 학습 중 (오답률 높음)
      'C:on:う': { seen: 2, wrong: 0 }, // 학습 중 (노출 부족)
      // D 미학습
    }),
  )

  it('중복 pairId 를 접고 seen/wrong 에 따라 상태를 매긴다', () => {
    const byId = new Map(rows.map((r) => [r.pairId, r]))
    expect(rows).toHaveLength(4)
    expect(byId.get('A:on:あ')!.status).toBe('mastered')
    expect(byId.get('B:on:い')!.status).toBe('learning')
    expect(byId.get('C:on:う')!.status).toBe('learning')
    expect(byId.get('D:kun:え')!.status).toBe('unseen')
  })

  it('학습 중(오답률 높은 순) → 미학습 → 숙달 순으로 정렬한다', () => {
    expect(rows.map((r) => r.pairId)).toEqual(['B:on:い', 'C:on:う', 'D:kun:え', 'A:on:あ'])
  })

  it('pairs 사전에 없는 pairId 는 제외한다', () => {
    expect(pairRows(['Z:on:ん'], pairs, state({}))).toEqual([])
  })
})

describe('summarize', () => {
  it('상태별 개수와 총계를 센다', () => {
    const rows = pairRows(['A:on:あ', 'B:on:い', 'D:kun:え'], pairs, state({ 'A:on:あ': { seen: 3, wrong: 0 } }))
    expect(summarize(rows)).toEqual({ total: 3, mastered: 1, learning: 0, unseen: 2 })
  })
})
