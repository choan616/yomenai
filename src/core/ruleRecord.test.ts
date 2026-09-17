// 규칙 절에 붙는 오답 기록 파생 검증 — 유형별 합산, 정렬, 이름 없는 숙어 처리
import { describe, expect, it } from 'vitest'
import { newCard } from './scheduler.ts'
import type { ReplayState } from './replay.ts'
import type { CardState, MistakeType } from './types.ts'
import { ruleRecord } from './ruleRecord.ts'

function card(idiomId: string, mistakes: Partial<Record<MistakeType, number>>, wrong?: number): CardState {
  return {
    idiomId,
    cardType: 'reading',
    card: newCard(0),
    mistakes,
    wrong: wrong ?? Object.values(mistakes).reduce((a, b) => a + b, 0),
    streak: 0,
    lastAt: 0,
  }
}

function state(): ReplayState {
  return {
    cards: new Map<string, CardState>([
      ['1:reading', card('1', { RENDAKU: 3, SOKUON: 1 })],
      ['2:reading', card('2', { RENDAKU: 1 })],
      ['3:reading', card('3', { SOKUON: 2 })],
      // 분류 실패분만 있는 카드 — 어느 절에도 안 들어간다
      ['4:reading', card('4', {}, 5)],
      ['9:reading', card('9', { RENDAKU: 9 })], // 이름을 모르는 숙어
    ]),
    meaningKnown: new Map(),
    onyomi: new Map(),
    applied: 0,
  }
}

const names: Record<string, { headword: string; reading: string }> = {
  '1': { headword: '三日月', reading: 'みかづき' },
  '2': { headword: '手紙', reading: 'てがみ' },
  '3': { headword: '学校', reading: 'がっこう' },
  '4': { headword: '認識', reading: 'にんしき' },
}
const nameOf = (id: string) => names[id]

describe('ruleRecord', () => {
  it('그 절의 유형들로 틀린 횟수를 합산한다', () => {
    const r = ruleRecord(state(), ['RENDAKU'], nameOf)
    // 3 + 1 + 9(이름 없는 숙어도 횟수엔 든다)
    expect(r.count).toBe(13)
  })

  it('유형을 여러 개 받으면 같이 센다', () => {
    const r = ruleRecord(state(), ['RENDAKU', 'SOKUON'], nameOf)
    expect(r.count).toBe(16)
  })

  it('많이 틀린 순으로 세우고 이름을 모르는 숙어는 목록에서 뺀다', () => {
    const r = ruleRecord(state(), ['RENDAKU'], nameOf)
    expect(r.idioms.map((i) => i.headword)).toEqual(['三日月', '手紙'])
    expect(r.idioms[0].wrong).toBe(3)
  })

  it('분류에 실패한 오답은 어느 절에도 안 들어간다', () => {
    const r = ruleRecord(state(), ['RENDAKU', 'SOKUON', 'CHOON', 'KO_INTERFERENCE'], nameOf)
    expect(r.idioms.map((i) => i.id)).not.toContain('4')
  })

  it('기록이 없으면 0 과 빈 목록이다', () => {
    const r = ruleRecord(state(), ['CHOON'], nameOf)
    expect(r).toEqual({ count: 0, idioms: [] })
  })

  it('상한을 넘으면 자른다', () => {
    const r = ruleRecord(state(), ['RENDAKU', 'SOKUON'], nameOf, 1)
    expect(r.idioms).toHaveLength(1)
    expect(r.count).toBe(16) // 자르는 건 목록이지 횟수가 아니다
  })
})
