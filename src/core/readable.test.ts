// 오늘 맞힌 것으로 읽히는 문장 — 후보 추출과 선별 (Phase 11)
import { describe, expect, it } from 'vitest'
import { correctReadings, pickReadable } from './readable.ts'
import type { LearningEvent } from './types.ts'

let n = 0
function ev(
  idiomId: string,
  correct: boolean,
  over: Partial<LearningEvent> = {},
): LearningEvent {
  return {
    id: `e${n++}`, userId: 'local', deviceId: 'd', at: n, idiomId,
    cardType: 'reading', mistakeType: null, deletedAt: null,
    type: 'review', grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1,
    ...over,
  } as LearningEvent
}

describe('correctReadings', () => {
  it('맞힌 읽기 숙어만, 처음 맞힌 순서로', () => {
    const s = [ev('b', true), ev('a', false), ev('c', true), ev('b', true)]
    expect(correctReadings(s)).toEqual(['b', 'c'])
  })

  it('뜻 카드와 삭제된 이벤트는 빼고 센다', () => {
    const s = [
      ev('a', true, { cardType: 'meaning' }),
      ev('b', true, { deletedAt: 1 }),
      ev('c', true),
    ]
    expect(correctReadings(s)).toEqual(['c'])
  })
})

describe('pickReadable', () => {
  const examples = new Map<string, string[]>([
    ['a', ['これは長い長い長い例文です。', '短い文。']],
    ['b', ['ちょっと長めの文です。']],
  ])

  it('가장 짧은 문장을 고른다 — 짧을수록 "읽혔다"가 분명하다', () => {
    expect(pickReadable(['a', 'b'], examples)).toEqual({ idiomId: 'a', sentence: '短い文。' })
  })

  it('예문 없는 후보는 건너뛴다', () => {
    expect(pickReadable(['x', 'b'], examples)).toEqual({
      idiomId: 'b',
      sentence: 'ちょっと長めの文です。',
    })
  })

  it('후보가 없거나 예문이 하나도 없으면 null', () => {
    expect(pickReadable([], examples)).toBeNull()
    expect(pickReadable(['x', 'y'], examples)).toBeNull()
    expect(pickReadable(['a'], new Map())).toBeNull()
  })

  it('입력 순서가 달라도 같은 결과 — 같은 세션이면 같은 문장이 나온다', () => {
    expect(pickReadable(['b', 'a'], examples)).toEqual(pickReadable(['a', 'b'], examples))
  })
})
