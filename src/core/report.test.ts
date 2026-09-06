// 진단 리포트 파생 검증 — 오답 유형 분포, 취약 음독, 한국음 간섭 집계
import { describe, expect, it } from 'vitest'
import type { OnyomiPair } from '../dict/load.ts'
import { newCard } from './scheduler.ts'
import type { ReplayState } from './replay.ts'
import type { CardState, MistakeType } from './types.ts'
import { buildReport } from './report.ts'

function card(
  idiomId: string,
  reps: number,
  mistakes: Partial<Record<MistakeType, number>>,
  /** 실제 오답 수. 안 주면 분류된 수와 같다고 본다 */
  wrong = Object.values(mistakes).reduce((a, b) => a + b, 0),
): CardState {
  return { idiomId, cardType: 'reading', card: { ...newCard(0), reps }, mistakes, wrong, lastAt: 0 }
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
      ['3:meaning', { idiomId: '3', cardType: 'meaning', card: { ...newCard(0), reps: 9 }, mistakes: {}, wrong: 0, lastAt: 0 }],
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

  it('실제 오답과 분류된 오답을 따로 센다', () => {
    expect(r.totalWrong).toBe(5)
    expect(r.unclassified).toBe(0)
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
    expect(empty).toMatchObject({
      totalReviews: 0, totalWrong: 0, totalMistakes: 0, unclassified: 0,
      mistakes: [], weakOnyomi: [], koInterferenceCount: 0,
    })
  })
})

describe('buildReport — 분류에 실패한 오답', () => {
  /** 4회 채점에 오답 3회인데 유형이 붙은 건 1회뿐 */
  function partial(): ReplayState {
    return {
      cards: new Map<string, CardState>([['1:reading', card('1', 4, { SOKUON: 1 }, 3)]]),
      meaningKnown: new Map(),
      onyomi: new Map(),
      applied: 0,
    }
  }

  const r = buildReport(partial(), pairs, () => undefined)

  it('totalWrong 은 실제 오답을, totalMistakes 는 분류된 것만 센다', () => {
    expect(r.totalWrong).toBe(3)
    expect(r.totalMistakes).toBe(1)
  })

  it('차이를 unclassified 로 드러낸다 — 숨기면 정답률이 부풀려진다', () => {
    expect(r.unclassified).toBe(2)
  })

  it('정답률을 totalWrong 으로 계산하면 25%, totalMistakes 로 하면 75% 가 된다', () => {
    expect((r.totalReviews - r.totalWrong) / r.totalReviews).toBeCloseTo(0.25)
    expect((r.totalReviews - r.totalMistakes) / r.totalReviews).toBeCloseTo(0.75)
  })

  it('뜻 카드의 오답은 읽기 집계에 안 섞인다', () => {
    const withMeaning: ReplayState = {
      cards: new Map<string, CardState>([
        ['1:reading', card('1', 2, {}, 1)],
        ['1:meaning', { idiomId: '1', cardType: 'meaning', card: { ...newCard(0), reps: 5 },
          mistakes: {}, wrong: 4, lastAt: 0 }],
      ]),
      meaningKnown: new Map(),
      onyomi: new Map(),
      applied: 0,
    }
    const m = buildReport(withMeaning, pairs, () => undefined)
    expect(m.totalReviews).toBe(2)
    expect(m.totalWrong).toBe(1)
  })
})
