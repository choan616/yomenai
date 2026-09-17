// 규칙 절에 붙는 오답 기록 파생 검증 — 절 조건별 합산, 정렬, 지워진 이벤트·미분류 제외
import { describe, expect, it } from 'vitest'
import { classifiedMistakes, ruleRecord } from './ruleRecord.ts'
import type { LearningEvent, MistakeType, ReviewEvent } from './types.ts'

let seq = 0
function ev(
  idiomId: string,
  mistakeType: MistakeType | null,
  over: Partial<ReviewEvent> = {},
): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(3, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at: 1_700_000_000_000 + seq,
    idiomId,
    cardType: 'reading',
    mistakeType,
    deletedAt: null,
    type: 'review',
    grade: 1,
    answer: 'みかつき',
    expected: 'みかづき',
    correct: false,
    elapsedMs: 1000,
    ...over,
  }
}

const names: Record<string, { headword: string; reading: string }> = {
  '1': { headword: '三日月', reading: 'みかづき' },
  '2': { headword: '手紙', reading: 'てがみ' },
  '3': { headword: '学校', reading: 'がっこう' },
  '4': { headword: '認識', reading: 'にんしき' },
}
const nameOf = (id: string) => names[id]
const isType = (t: MistakeType) => (e: ReviewEvent) => e.mistakeType === t

describe('classifiedMistakes', () => {
  it('유형이 붙은 읽기 오답만 남긴다', () => {
    const events: LearningEvent[] = [
      ev('1', 'RENDAKU'),
      ev('4', null), // 미분류 오답 — 어느 절에도 안 간다
      ev('1', 'RENDAKU', { deletedAt: 1_700_000_100_000 }), // 지워진 이벤트
      ev('3', 'SOKUON', { cardType: 'meaning' }), // 뜻 카드
      {
        id: 'k1',
        userId: 'local',
        deviceId: 'dev',
        at: 1,
        idiomId: '2',
        cardType: 'meaning',
        mistakeType: null,
        deletedAt: null,
        type: 'meaningKnown',
        known: true,
      },
    ]
    expect(classifiedMistakes(events).map((e) => e.idiomId)).toEqual(['1'])
  })
})

describe('ruleRecord', () => {
  const events = classifiedMistakes([
    ev('1', 'RENDAKU'),
    ev('1', 'RENDAKU'),
    ev('1', 'RENDAKU'),
    ev('2', 'RENDAKU'),
    ev('3', 'SOKUON'),
    ev('3', 'SOKUON'),
    ev('9', 'RENDAKU'), // 이름을 모르는 숙어
  ])

  it('절 조건에 맞는 오답을 센다', () => {
    expect(ruleRecord(events, isType('RENDAKU'), nameOf).count).toBe(5)
    expect(ruleRecord(events, isType('SOKUON'), nameOf).count).toBe(2)
  })

  it('많이 틀린 순으로 세우고 이름을 모르는 숙어는 목록에서 뺀다', () => {
    const r = ruleRecord(events, isType('RENDAKU'), nameOf)
    expect(r.idioms.map((i) => i.headword)).toEqual(['三日月', '手紙'])
    expect(r.idioms[0].wrong).toBe(3)
  })

  it('갈래까지 보는 절은 그 갈래만 센다 — 세 절이 같은 숫자를 보이면 안 된다', () => {
    const handaku = (e: ReviewEvent) => e.mistakeType === 'RENDAKU' && e.expected === 'しんぱい'
    const mixed = classifiedMistakes([
      ev('1', 'RENDAKU'),
      ev('5', 'RENDAKU', { expected: 'しんぱい', answer: 'しんはい' }),
      ev('5', 'RENDAKU', { expected: 'しんぱい', answer: 'しんはい' }),
    ])
    expect(ruleRecord(mixed, handaku, nameOf).count).toBe(2)
    expect(ruleRecord(mixed, (e) => !handaku(e), nameOf).count).toBe(1)
  })

  it('기록이 없으면 0 과 빈 목록이다', () => {
    expect(ruleRecord(events, isType('CHOON'), nameOf)).toEqual({ count: 0, idioms: [] })
  })

  it('상한을 넘으면 목록만 자른다 — 횟수는 안 깎인다', () => {
    const r = ruleRecord(events, isType('RENDAKU'), nameOf, 1)
    expect(r.idioms).toHaveLength(1)
    expect(r.count).toBe(5)
  })
})
