// 지연 검수 응답 접기(foldMeaningKnown)와 어긋남 판정의 단위 테스트
import { describe, it, expect } from 'vitest'
import type { LearningEvent } from '../src/core/types.ts'
import { foldMeaningKnown, contradicts, proposedCategory } from './build-event-worklist.ts'

function known(id: string, idiomId: string, at: number, k: boolean, deletedAt: number | null = null): LearningEvent {
  return {
    id, userId: 'u', deviceId: 'd', at, idiomId,
    cardType: 'meaning', mistakeType: null, deletedAt,
    type: 'meaningKnown', known: k,
  }
}
function review(id: string, idiomId: string, at: number): LearningEvent {
  return {
    id, userId: 'u', deviceId: 'd', at, idiomId,
    cardType: 'reading', mistakeType: null, deletedAt: null,
    type: 'review', grade: 3, answer: 'あ', expected: 'あ', correct: true, elapsedMs: 100,
  }
}

describe('foldMeaningKnown', () => {
  it('review 이벤트와 삭제 묘비는 버린다', () => {
    const out = foldMeaningKnown([review('a', '1', 1), known('b', '2', 2, true, 99)])
    expect(out).toEqual([])
  })

  it('숙어별 마지막 응답을 남기고 뒤집힘을 표시한다', () => {
    const out = foldMeaningKnown([
      known('c', '1', 300, false),
      known('a', '1', 100, true),
      known('b', '1', 200, true),
    ])
    expect(out).toEqual([{ idiomId: '1', known: false, count: 3, flipped: true, at: 300 }])
  })

  it('같은 응답만 있으면 flipped 는 false', () => {
    const out = foldMeaningKnown([known('a', '1', 100, true), known('b', '1', 200, true)])
    expect(out[0]).toMatchObject({ known: true, count: 2, flipped: false })
  })

  it('같은 시각이면 id 로 갈라 기기 순서에 안 흔들린다', () => {
    const forward = foldMeaningKnown([known('a', '1', 100, true), known('b', '1', 100, false)])
    const backward = foldMeaningKnown([known('b', '1', 100, false), known('a', '1', 100, true)])
    expect(forward[0].known).toBe(false)
    expect(backward[0].known).toBe(forward[0].known)
  })

  it('숙어가 여럿이면 각각 접는다', () => {
    const out = foldMeaningKnown([known('a', '1', 100, true), known('b', '2', 200, false)])
    expect(out.map((o) => o.idiomId).sort()).toEqual(['1', '2'])
  })
})

describe('contradicts', () => {
  it('알았다 + 분류 2·3 은 어긋남, 분류 1 은 일치', () => {
    expect(contradicts(true, 2)).toBe(true)
    expect(contradicts(true, 3)).toBe(true)
    expect(contradicts(true, 1)).toBe(false)
  })

  it('몰랐다 + 분류 1 만 어긋남', () => {
    expect(contradicts(false, 1)).toBe(true)
    expect(contradicts(false, 2)).toBe(false)
    expect(contradicts(false, 3)).toBe(false)
  })
})

describe('proposedCategory', () => {
  it('알았다는 동형동의(1)', () => {
    expect(proposedCategory(true, 3)).toBe(1)
  })

  it('몰랐다는 2·3 을 못 가르므로 잠정 분류를 물려준다', () => {
    expect(proposedCategory(false, 3)).toBe(3)
    expect(proposedCategory(false, 2)).toBe(2)
    expect(proposedCategory(false, 1)).toBe(2)
  })
})
