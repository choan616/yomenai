// 규칙별 첫 만남 정답률 검증 — 반복 정답이 숫자를 안 올리는지, 규칙 없는 숙어가 안 세는지
import { describe, expect, it } from 'vitest'
import { firstTryByRule, type MeasuredVariant } from './firstTry.ts'
import type { ReviewEvent } from './types.ts'

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

/** idiomId → 그 숙어가 걸린 규칙 절. 사전을 모르는 `firstTryByRule` 대신 테스트가 들고 넘긴다 */
function appliesTo(table: Record<string, MeasuredVariant[]>) {
  return (idiomId: string) => new Set(table[idiomId] ?? [])
}

describe('firstTryByRule', () => {
  it('① 같은 숙어를 반복해 맞힌 로그가 숫자를 안 올린다', () => {
    const events = [
      ev('1', 1, { correct: true }),
      ev('1', 2, { correct: true }),
      ev('1', 3, { correct: true }),
    ]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon'] }))
    expect(out.get('sokuon')).toEqual({ seen: 1, correct: 1 })
  })

  it('② 첫 만남이 오답이고 두 번째가 정답이면 correct 는 0', () => {
    const events = [
      ev('1', 1, { correct: false }),
      ev('1', 2, { correct: true }),
    ]
    const out = firstTryByRule(events, appliesTo({ '1': ['rendaku'] }))
    expect(out.get('rendaku')).toEqual({ seen: 1, correct: 0 })
  })

  it('③ 규칙이 안 걸린 숙어는 안 센다', () => {
    const events = [ev('1', 1, { correct: true }), ev('2', 1, { correct: true })]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon'] })) // '2' 는 테이블에 없다 → 빈 Set
    expect(out.get('sokuon')).toEqual({ seen: 1, correct: 1 })
    expect(out.size).toBe(1)
  })

  it('④ 재지 않는 절은 Map 에 없다', () => {
    const events = [ev('1', 1, { correct: true })]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon'] }))
    expect(out.has('rendaku')).toBe(false)
    expect(out.has('handaku')).toBe(false)
    expect(out.has('renjo')).toBe(false)
    expect([...out.keys()]).toEqual(['sokuon'])
  })

  it('시간순이 섞여 들어와도 가장 이른 이벤트를 첫 만남으로 본다', () => {
    const events = [
      ev('1', 300, { correct: true }), // 입력 순서는 먼저지만 시각은 가장 늦다
      ev('1', 100, { correct: false }), // 실제 첫 만남
      ev('1', 200, { correct: true }),
    ]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon'] }))
    expect(out.get('sokuon')).toEqual({ seen: 1, correct: 0 })
  })

  it('지워진 이벤트·뜻 카드는 첫 만남 후보에서 뺀다', () => {
    const events = [
      ev('1', 100, { deletedAt: 999 }), // 지워진 이벤트 — 후보에서 빠진다
      ev('1', 200, { cardType: 'meaning' }),
      ev('1', 300, { correct: true }), // 남은 것 중 가장 이른 것
    ]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon'] }))
    expect(out.get('sokuon')).toEqual({ seen: 1, correct: 1 })
  })

  it('한 숙어가 규칙 둘에 걸리면 둘 다에 반영한다', () => {
    const events = [ev('1', 1, { correct: false })]
    const out = firstTryByRule(events, appliesTo({ '1': ['sokuon', 'rendaku'] }))
    expect(out.get('sokuon')).toEqual({ seen: 1, correct: 0 })
    expect(out.get('rendaku')).toEqual({ seen: 1, correct: 0 })
  })
})
