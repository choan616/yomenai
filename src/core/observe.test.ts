// 루프 안 관찰 — 취약 음독 반전만 잡아낸다 (Phase 9-C)
import { describe, expect, it } from 'vitest'
import type { LearningEvent, OnyomiStat } from './types.ts'
import { observeReading } from './observe.ts'

const stat = (pairId: string, seen: number, wrong: number): [string, OnyomiStat] => [
  pairId,
  { pairId, seen, wrong },
]

// 忠 ちゅう / 実 じつ 두 쌍짜리 숙어를 방금 맞혔다고 가정
const PAIRS = ['忠:on:ちゅう', '実:on:じつ']
const pairsOf = () => PAIRS

describe('observeReading', () => {
  it('이력이 나빴던(오답 ≥ 2, 오답 > 정답) 음독이 있으면 잡는다', () => {
    const before = new Map([stat('忠:on:ちゅう', 3, 3)]) // 3번 다 틀림
    const o = observeReading({ pairIds: PAIRS, before, sessionEvents: [], pairsOf })
    expect(o).toEqual({
      kind: 'WEAK_ONYOMI_RECOVERED',
      kanji: '忠',
      base: 'ちゅう',
      onKind: 'on',
      priorWrong: 3,
    })
  })

  it('가장 나빴던 쌍 하나만 돌려준다', () => {
    const before = new Map([stat('忠:on:ちゅう', 2, 2), stat('実:on:じつ', 5, 4)])
    const o = observeReading({ pairIds: PAIRS, before, sessionEvents: [], pairsOf })
    expect(o?.kanji).toBe('実')
    expect(o?.priorWrong).toBe(4)
  })

  it('이력이 좋으면 null (오답이 정답 이하)', () => {
    const before = new Map([stat('忠:on:ちゅう', 5, 2)]) // 3정답 2오답
    expect(observeReading({ pairIds: PAIRS, before, sessionEvents: [], pairsOf })).toBeNull()
  })

  it('오답이 1개뿐이면 null (아직 "취약"이 아니다)', () => {
    const before = new Map([stat('忠:on:ちゅう', 1, 1)])
    expect(observeReading({ pairIds: PAIRS, before, sessionEvents: [], pairsOf })).toBeNull()
  })

  it('이번 세션에 쌓인 오답도 이력에 더한다', () => {
    const before = new Map([stat('忠:on:ちゅう', 1, 1)])
    const sessionEvents: LearningEvent[] = [
      {
        id: 'e1', userId: 'local', deviceId: 'd', at: 1, idiomId: 'x',
        cardType: 'reading', mistakeType: 'ONYOMI_CHOICE', deletedAt: null,
        type: 'review', grade: 1, answer: '', expected: '', correct: false, elapsedMs: 1,
      },
    ]
    // before 1오답 + 세션 1오답 = 2오답, 정답 0 → 잡힌다
    const o = observeReading({ pairIds: PAIRS, before, sessionEvents, pairsOf })
    expect(o?.kanji).toBe('忠')
    expect(o?.priorWrong).toBe(2)
  })

  it('이력이 아예 없으면 null', () => {
    expect(observeReading({ pairIds: PAIRS, before: new Map(), sessionEvents: [], pairsOf })).toBeNull()
  })
})
