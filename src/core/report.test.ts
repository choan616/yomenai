// 진단 리포트 파생 검증 — 오답 유형 분포, 취약 음독, 한국음 간섭 집계
import { describe, expect, it } from 'vitest'
import type { OnyomiPair } from '../dict/load.ts'
import { newCard } from './scheduler.ts'
import type { ReplayState } from './replay.ts'
import type { CardState, MistakeType } from './types.ts'
import { buildReport } from './report.ts'

function card(idiomId: string, reps: number, mistakes: Partial<Record<MistakeType, number>>): CardState {
  return { idiomId, cardType: 'reading', card: { ...newCard(0), reps }, mistakes, lastAt: 0 }
}

const pairs = new Map<string, OnyomiPair>([
  ['認:on:にん', { kanji: '認', base: 'にん', kind: 'on' }],
  ['識:on:しき', { kanji: '識', base: 'しき', kind: 'on' }],
])

function state(): ReplayState {
  return {
    cards: new Map<string, CardState>([
      ['1:reading', card('1', 4, { KO_INTERFERENCE: 2, ONYOMI_CHOICE: 1 })],
      ['2:reading', card('2', 3, { KO_INTERFERENCE: 1 })],
      ['3:reading', card('3', 2, { RENDAKU: 1 })],
      ['3:meaning', { idiomId: '3', cardType: 'meaning', card: { ...newCard(0), reps: 9 }, mistakes: {}, lastAt: 0 }],
    ]),
    meaningKnown: new Map(),
    onyomi: new Map([
      ['認:on:にん', { pairId: '認:on:にん', seen: 5, wrong: 4 }],
      ['識:on:しき', { pairId: '識:on:しき', seen: 4, wrong: 1 }],
      ['低:on:てい', { pairId: '低:on:てい', seen: 2, wrong: 2 }], // seen < 3 → 제외
    ]),
    applied: 0,
  }
}

const names: Record<string, { headword: string; reading: string }> = {
  '1': { headword: '認識', reading: 'にんしき' },
  '2': { headword: '知識', reading: 'ちしき' },
}

describe('buildReport', () => {
  const r = buildReport(state(), pairs, (id) => names[id])

  it('오답 유형을 많은 순으로, 0 은 빼고 집계한다', () => {
    expect(r.mistakes).toEqual([
      { type: 'KO_INTERFERENCE', count: 3 },
      { type: 'ONYOMI_CHOICE', count: 1 },
      { type: 'RENDAKU', count: 1 },
    ])
    expect(r.totalMistakes).toBe(5)
  })

  it('읽기 카드 reps 만 합산한다 (뜻 카드 제외)', () => {
    expect(r.totalReviews).toBe(9)
  })

  it('취약 음독은 seen>=3 && wrong>0 만, 오답률 내림차순', () => {
    expect(r.weakOnyomi.map((w) => w.pairId)).toEqual(['認:on:にん', '識:on:しき'])
    expect(r.weakOnyomi[0]).toMatchObject({ kanji: '認', base: 'にん', seen: 5, wrong: 4 })
    expect(r.weakOnyomi[0].rate).toBeCloseTo(0.8)
  })

  it('한국음 간섭 숙어를 이름과 함께 모은다', () => {
    expect(r.koInterferenceCount).toBe(3)
    expect(r.koInterferenceIdioms).toEqual([
      { id: '1', headword: '認識', reading: 'にんしき' },
      { id: '2', headword: '知識', reading: 'ちしき' },
    ])
  })

  it('데이터가 없으면 빈 리포트', () => {
    const empty = buildReport(
      { cards: new Map(), meaningKnown: new Map(), onyomi: new Map(), applied: 0 },
      pairs,
      () => undefined,
    )
    expect(empty).toMatchObject({ totalReviews: 0, totalMistakes: 0, mistakes: [], weakOnyomi: [], koInterferenceCount: 0 })
  })
})
