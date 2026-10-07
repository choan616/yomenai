// 응답 시간 예측 타당도 집계 검증 — 느린/빠른 정답 뒤 오답률이 올바른 분모·분자로 난다
import { describe, expect, it } from 'vitest'
import { pacePredictiveValidity } from './audit-pace.ts'
import type { ReviewEvent } from '../src/core/types.ts'

let seq = 0
function ev(idiomId: string, at: number, over: Partial<ReviewEvent> = {}): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at,
    idiomId,
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: 3,
    answer: 'x',
    expected: 'x',
    correct: true,
    elapsedMs: 1000,
    ...over,
  }
}

describe('pacePredictiveValidity', () => {
  it('정답 이벤트가 없으면 null', () => {
    expect(pacePredictiveValidity([])).toBeNull()
    expect(pacePredictiveValidity([ev('1', 1, { correct: false })])).toBeNull()
  })

  it('느린 정답 뒤 오답과 빠른 정답 뒤 오답을 따로 센다', () => {
    const events = [
      // 중앙값을 세울 기준 — 1000ms 정답 다수
      ev('a', 1), ev('a', 2),
      ev('b', 1), ev('b', 2),
      ev('c', 1), ev('c', 2),
      // 느린 정답(5000 >= 1000*2) 뒤 오답
      ev('slow1', 1, { elapsedMs: 5000 }),
      ev('slow1', 2, { correct: false }),
      // 느린 정답 뒤 정답
      ev('slow2', 1, { elapsedMs: 5000 }),
      ev('slow2', 2, { correct: true }),
      // 빠른 정답(1000) 뒤 오답
      ev('fast1', 1, { elapsedMs: 1000 }),
      ev('fast1', 2, { correct: false }),
    ]
    const result = pacePredictiveValidity(events)
    expect(result).not.toBeNull()
    expect(result?.medianMs).toBe(1000)
    expect(result?.slow).toEqual({ seen: 2, wrongNext: 1 })
    // a/b/c 의 두 번째 이벤트(1000ms, 다음 이벤트 없음)는 분모에서 빠지고,
    // a/b/c 의 첫 이벤트(1000ms, 다음이 있음) 3건 + fast1 의 첫 이벤트 1건 = 4건
    expect(result?.fast).toEqual({ seen: 4, wrongNext: 1 })
  })

  it('지워진 이벤트·뜻 카드·60초 초과 이벤트는 제외한다', () => {
    const events = [
      ev('a', 1), ev('a', 2, { correct: false, deletedAt: 10 }), // 삭제 — 다음 이벤트로 안 쓴다
      ev('b', 1, { cardType: 'meaning' }),
      ev('c', 1, { elapsedMs: 100_000 }), // 60초 초과 — 분모에서 빠진다
      ev('c', 2, { correct: false }),
    ]
    const result = pacePredictiveValidity(events)
    expect(result?.slow.seen).toBe(0)
    expect(result?.fast.seen).toBe(0)
  })

  it('같은 카드의 바로 다음 이벤트만 본다 (멀리 있는 이벤트를 안 쓴다)', () => {
    const baseline = ['base1', 'base2', 'base3', 'base4', 'base5'].flatMap((id) => [
      ev(id, 1), // 1000ms 정답 다수로 중앙값을 1000 에 고정
      ev(id, 2),
    ])
    const events = [
      ...baseline,
      ev('a', 1, { elapsedMs: 5000 }), // 느린 정답
      ev('a', 2, { correct: true }), // 바로 다음 — 정답
      ev('a', 3, { correct: false }), // 그다음 — 안 본다
    ]
    const result = pacePredictiveValidity(events)
    expect(result?.medianMs).toBe(1000)
    expect(result?.slow).toEqual({ seen: 1, wrongNext: 0 })
  })
})
