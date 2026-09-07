// 처방 — 우선순위와 파급력 정렬 (Phase 10)
import { describe, expect, it } from 'vitest'
import type { LevelProfile } from './level.ts'
import { prescribe, PRESCRIPTION_MIN_READINGS } from './prescription.ts'
import type { Report, WeakOnyomi } from './report.ts'

const weak = (pairId: string, kanji: string, wrong: number, seen: number): WeakOnyomi => ({
  pairId, kanji, base: 'x', kind: 'on', seen, wrong, rate: wrong / seen,
})

function report(over: Partial<Report> = {}): Report {
  return {
    totalReviews: 100,
    totalWrong: 20,
    totalMistakes: 20,
    unclassified: 0,
    mistakes: [],
    weakOnyomi: [],
    koInterferenceCount: 0,
    koInterferenceIdioms: [],
    ...over,
  }
}

function level(over: Partial<LevelProfile> = {}): LevelProfile {
  return {
    bands: [
      { band: 1, seen: 40, correct: 38, rate: 0.95, status: 'solid' },
      { band: 2, seen: 40, correct: 20, rate: 0.5, status: 'shaky' },
      { band: 3, seen: 0, correct: 0, rate: 0, status: 'unseen' },
    ],
    solidThrough: 1,
    edge: 2,
    totalReadings: 80,
    ...over,
  }
}

describe('prescribe', () => {
  it('표본이 적으면 처방 대신 더 모으자고만 말한다', () => {
    const out = prescribe({
      report: report(),
      level: level({ totalReadings: 12 }),
      unlocksOf: () => 99,
    })
    expect(out).toEqual([
      { kind: 'MORE_DATA', seen: 12, need: PRESCRIPTION_MIN_READINGS - 12 },
    ])
  })

  it('지배적 오답 유형(30% 이상)이 첫 처방이다', () => {
    const out = prescribe({
      report: report({ mistakes: [{ type: 'SOKUON', count: 8 }], totalWrong: 20 }),
      level: level(),
      unlocksOf: () => 0,
    })
    expect(out[0]).toEqual({ kind: 'MISTAKE_RULE', type: 'SOKUON', count: 8, share: 0.4 })
  })

  it('30% 미만이면 오답 유형은 처방에 안 올린다', () => {
    const out = prescribe({
      report: report({ mistakes: [{ type: 'SOKUON', count: 5 }], totalWrong: 20 }),
      level: level(),
      unlocksOf: () => 0,
    })
    expect(out.some((p) => p.kind === 'MISTAKE_RULE')).toBe(false)
  })

  it('취약 음독은 오답률이 아니라 파급력(unlocks) 순으로 세운다', () => {
    const unlocks: Record<string, number> = { a: 3, b: 21 }
    const out = prescribe({
      // a 가 오답률은 더 높지만 b 가 훨씬 많은 숙어에 걸려 있다
      report: report({ weakOnyomi: [weak('a', '甲', 5, 5), weak('b', '乙', 3, 6)] }),
      level: level({ edge: null }),
      unlocksOf: (id) => unlocks[id] ?? 0,
    })
    expect(out.map((p) => (p.kind === 'ONYOMI' ? p.kanji : p.kind))).toEqual(['乙', '甲'])
    expect(out[0]).toMatchObject({ kind: 'ONYOMI', pairId: 'b', unlocks: 21, wrong: 3, seen: 6 })
  })

  it('경계 밴드는 마지막에 붙고, 3개를 넘지 않는다', () => {
    const out = prescribe({
      report: report({
        mistakes: [{ type: 'RENDAKU', count: 10 }],
        totalWrong: 20,
        weakOnyomi: [weak('a', '甲', 5, 5), weak('b', '乙', 4, 5), weak('c', '丙', 3, 5)],
      }),
      level: level(),
      unlocksOf: () => 1,
    })
    expect(out).toHaveLength(3)
    expect(out.map((p) => p.kind)).toEqual(['MISTAKE_RULE', 'ONYOMI', 'ONYOMI'])
  })

  it('경계가 없고 짚을 것도 없으면 빈 목록이다', () => {
    const out = prescribe({
      report: report({ totalWrong: 0 }),
      level: level({ edge: null, solidThrough: 3 }),
      unlocksOf: () => 0,
    })
    expect(out).toEqual([])
  })

  it('오답 유형이 없어도 경계 밴드는 나온다', () => {
    const out = prescribe({ report: report(), level: level(), unlocksOf: () => 0 })
    expect(out).toEqual([{ kind: 'BAND', band: 2, rate: 0.5, seen: 40 }])
  })
})
