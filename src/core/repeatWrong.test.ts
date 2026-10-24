// 같은 오답 되풀이 판정·틀린 조각 짚기·짝 표현 고르기를 검증한다 (PLAN §11 D4)
import { describe, expect, it } from 'vitest'
import { buildHomophoneIndex, type QuizIdiom } from './quiz.ts'
import { alignWrong, confusedWith, repeatHint, sameWrongBefore, wrongPiece } from './repeatWrong.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'
import type { KanjiReadings } from '../lib/onyomi.ts'

const KANJI: Record<string, KanjiReadings> = {
  店: { onyomi: ['テン'], kunyomi: ['みせ', 'たな'] },
  子: { onyomi: ['シ', 'ス'], kunyomi: ['こ'] },
  敢: { onyomi: ['カン'], kunyomi: [] },
  行: { onyomi: ['コウ', 'ギョウ', 'アン'], kunyomi: ['い.く', 'おこな.う'] },
  興: { onyomi: ['コウ', 'キョウ'], kunyomi: ['おこ.る'] },
  業: { onyomi: ['ギョウ', 'ゴウ'], kunyomi: ['わざ'] },
  高: { onyomi: ['コウ'], kunyomi: ['たか.い'] },
  校: { onyomi: ['コウ'], kunyomi: [] },
}
const lookup = (k: string): KanjiReadings | undefined => KANJI[k]

let seq = 0
function review(
  idiomId: string,
  answer: string,
  opts: { correct?: boolean; cardType?: 'reading' | 'meaning'; deletedAt?: number | null } = {},
): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at: seq,
    idiomId,
    cardType: opts.cardType ?? 'reading',
    mistakeType: null,
    deletedAt: opts.deletedAt ?? null,
    type: 'review',
    grade: 1,
    answer,
    expected: 'x',
    correct: opts.correct ?? false,
    elapsedMs: 1000,
  }
}

function idiom(idiomId: string, headword: string, reading: string): QuizIdiom {
  return { idiomId, headword, reading, koMeaning: null }
}

describe('sameWrongBefore', () => {
  it('같은 답을 전에 낸 적이 있으면 true — 2회째부터', () => {
    expect(sameWrongBefore([review('a', 'たなこ')], 'a', 'たなこ')).toBe(true)
  })

  it('첫 오답이면 false', () => {
    expect(sameWrongBefore([], 'a', 'たなこ')).toBe(false)
    expect(sameWrongBefore([review('a', 'たなこ', { correct: true })], 'a', 'たなこ')).toBe(false)
  })

  it('다른 답이나 다른 표현의 같은 답은 false', () => {
    expect(sameWrongBefore([review('a', 'たなし')], 'a', 'たなこ')).toBe(false)
    expect(sameWrongBefore([review('b', 'たなこ')], 'a', 'たなこ')).toBe(false)
  })

  it('빈 답(넘김·모르겠음)은 false — 이전 빈 답과 겹쳐도 센다', () => {
    expect(sameWrongBefore([review('a', '')], 'a', '')).toBe(false)
    expect(sameWrongBefore([review('a', '')], 'a', '  ')).toBe(false)
  })

  it('삭제된 이벤트와 뜻 카드 이벤트는 무시한다', () => {
    expect(sameWrongBefore([review('a', 'たなこ', { deletedAt: 5 })], 'a', 'たなこ')).toBe(false)
    expect(sameWrongBefore([review('a', 'たなこ', { cardType: 'meaning' })], 'a', 'たなこ')).toBe(false)
  })

  it('가타카나·공백 차이는 같은 답으로 본다', () => {
    expect(sameWrongBefore([review('a', 'たなこ')], 'a', ' タナコ ')).toBe(true)
  })

  it('reading 이 아닌 이벤트 종류는 무시한다', () => {
    const known: LearningEvent = {
      id: 'k1',
      userId: 'local',
      deviceId: 'dev',
      at: 1,
      idiomId: 'a',
      cardType: 'meaning',
      mistakeType: null,
      deletedAt: null,
      type: 'meaningKnown',
      known: true,
    }
    expect(sameWrongBefore([known], 'a', 'たなこ')).toBe(false)
  })
})

describe('wrongPiece', () => {
  it('연탁을 놓친 조각을 짚는다 (店子 たなこ → たなご)', () => {
    expect(wrongPiece('店子', 'たなこ', 'たなご', lookup)).toEqual({ kanji: '子', expectedPiece: 'こ', answerPiece: 'ご' })
  })

  it('장음을 빠뜨린 조각을 짚는다 (高校 こうこう → ここう)', () => {
    expect(wrongPiece('高校', 'こうこう', 'ここう', lookup)).toEqual({
      kanji: '高',
      expectedPiece: 'こう',
      answerPiece: 'こ',
    })
  })

  it('다른 읽기로 바꾼 조각을 짚는다 (敢行 かんこう → かんぎょう)', () => {
    expect(wrongPiece('敢行', 'かんこう', 'かんぎょう', lookup)).toEqual({
      kanji: '行',
      expectedPiece: 'こう',
      answerPiece: 'ぎょう',
    })
  })

  it('조각이 둘 이상 틀리면 null', () => {
    expect(wrongPiece('敢行', 'かんこう', 'がんぎょう', lookup)).toBeNull()
  })

  it('경계에 걸친 답은 답 자신의 분해가 자리를 가리면 그 조각을 짚는다', () => {
    expect(wrongPiece('高校', 'こうこう', 'こうこうう', lookup)).toEqual({
      kanji: '校',
      expectedPiece: 'こう',
      answerPiece: 'こうう',
    })
  })

  it('경계에 걸쳐 답의 분해로도 자리를 못 가리면 null', () => {
    expect(wrongPiece('高校', 'こうこう', 'こうこうこう', lookup)).toBeNull()
  })

  it('빈 답·분해 못 하는 표기는 null', () => {
    expect(wrongPiece('敢行', 'かんこう', '', lookup)).toBeNull()
    expect(wrongPiece('敢嶽', 'かんこう', 'かんぎょう', lookup)).toBeNull()
  })

  it('src/core 의 alignWrong 은 tools 가 쓰는 것과 같은 계약이다', () => {
    expect(alignWrong([{ kanji: '子', surface: 'こ' }], 'ご')).toEqual({
      ok: true,
      index: 0,
      kanji: '子',
      expected: 'こ',
      wrong: 'ご',
    })
  })
})

describe('confusedWith', () => {
  const index = buildHomophoneIndex([
    idiom('kou', '興業', 'こうぎょう'),
    idiom('kan', '敢行', 'かんこう'),
    idiom('kan2', '観光', 'かんこう'),
    idiom('kan3', '刊行', 'かんこう'),
    idiom('saka', '盛業', 'せいぎょう'),
  ])

  it('학습한 다른 표현 하나와 읽기가 같으면 그 표현', () => {
    expect(confusedWith('こうぎょう', 'kan', new Set(['kou']), index)).toEqual({ idiomId: 'kou', headword: '興業' })
  })

  it('학습하지 않은 표현은 제외한다', () => {
    expect(confusedWith('こうぎょう', 'kan', new Set(), index)).toBeNull()
    expect(confusedWith('こうぎょう', 'kan', new Set(['saka']), index)).toBeNull()
  })

  it('후보가 둘 이상이면 null', () => {
    expect(confusedWith('かんこう', 'kou', new Set(['kan', 'kan2']), index)).toBeNull()
  })

  it('후보가 하나로 좁혀지면(나머지는 학습 안 함) 그 표현', () => {
    expect(confusedWith('かんこう', 'kou', new Set(['kan2']), index)).toEqual({ idiomId: 'kan2', headword: '観光' })
  })

  it('자기 자신은 제외한다', () => {
    expect(confusedWith('かんこう', 'kan', new Set(['kan']), index)).toBeNull()
  })

  it('같은 표기의 다른 읽기 항목은 짝이 아니다', () => {
    const idx = buildHomophoneIndex([idiom('i1', '市場', 'いちば'), idiom('i2', '市場', 'しじょう')])
    expect(confusedWith('しじょう', 'i1', new Set(['i2']), idx)).toBeNull()
  })

  it('빈 답과 색인에 없는 읽기는 null', () => {
    expect(confusedWith('', 'kan', new Set(['kou']), index)).toBeNull()
    expect(confusedWith('ほげ', 'kan', new Set(['kou']), index)).toBeNull()
  })
})

describe('repeatHint', () => {
  const index = buildHomophoneIndex([idiom('kan', '敢行', 'かんこう'), idiom('kou', '興業', 'こうぎょう')])
  const base = {
    idiomId: 'kan',
    headword: '敢行',
    expected: 'かんこう',
    lookup,
    learned: new Set(['kou']),
    readingIndex: index,
  }

  it('같은 오답이 처음이면 null', () => {
    expect(repeatHint({ ...base, prior: [], answer: 'こうぎょう' })).toBeNull()
  })

  it('2회째면 답·틀린 조각·짝을 모은다', () => {
    const h = repeatHint({ ...base, prior: [review('kan', 'こうぎょう')], answer: 'こうぎょう' })
    expect(h).toEqual({ answer: 'こうぎょう', pair: { idiomId: 'kou', headword: '興業' } })
  })

  it('조각만 있고 짝이 없는 경우', () => {
    const h = repeatHint({ ...base, prior: [review('kan', 'かんぎょう')], answer: 'かんぎょう' })
    expect(h).toEqual({ answer: 'かんぎょう', piece: { kanji: '行', expectedPiece: 'こう', answerPiece: 'ぎょう' } })
  })

  it('조각도 짝도 없으면 답만 돌려준다', () => {
    const h = repeatHint({ ...base, prior: [review('kan', 'ほげ')], answer: 'ほげ' })
    expect(h).toEqual({ answer: 'ほげ' })
  })

  it('빈 답은 null', () => {
    expect(repeatHint({ ...base, prior: [review('kan', '')], answer: '' })).toBeNull()
  })
})
