// 오답 유형 6종 자동 판정 검증. 유형별 대표 케이스 3개씩 (checklist Phase 4)
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildKoSiblingIndex, classifyMistake, type MistakeContext } from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import type { MistakeType } from './types.ts'

function contextFor(kanji: typeof KANJI_FIXTURE): MistakeContext {
  return {
    lookup: (k) => kanji[k],
    koSiblingOnyomi: buildKoSiblingIndex(kanji),
  }
}

const ctx = contextFor(KANJI_FIXTURE)

/** [숙어, 정답 읽기, 오답 입력] */
type Case = [string, string, string]

const CASES: Record<MistakeType, Case[]> = {
  // 같은 한자의 *다른* 음독을 골랐다. 답 자체는 일본어로 파싱된다
  ONYOMI_CHOICE: [
    ['発端', 'ほったん', 'はつたん'],
    ['支度', 'したく', 'しど'],
    ['人数', 'にんずう', 'じんすう'],
  ],
  // 連濁·半濁音을 놓쳤다
  RENDAKU: [
    ['三日月', 'みかづき', 'みかつき'],
    ['心配', 'しんぱい', 'しんはい'],
    ['花火', 'はなび', 'はなひ'],
  ],
  // 促音便을 놓쳤다
  SOKUON: [
    ['発達', 'はったつ', 'はつたつ'],
    ['学校', 'がっこう', 'がくこう'],
    ['一体', 'いったい', 'いちたい'],
  ],
  // 장음을 흘렸다
  CHOON: [
    ['特徴', 'とくちょう', 'とくちょ'],
    ['高校', 'こうこう', 'こうこ'],
    ['数字', 'すうじ', 'すじ'],
  ],
  // 重箱·湯桶 읽기를 못 알아보고 한쪽으로 통일했다
  MIXED_READING: [
    ['重箱', 'じゅうばこ', 'じゅうそう'],
    ['大勢', 'おおぜい', 'たいせい'],
    ['荷物', 'にもつ', 'かぶつ'],
  ],
  // 한국음이 같은 *다른* 한자의 음독을 끌어왔다. 자기 한자의 읽기가 아니다
  KO_INTERFERENCE: [
    ['認識', 'にんしき', 'にんしょく'],
    ['温度', 'おんど', 'おんとう'],
    ['感謝', 'かんしゃ', 'かんさ'],
  ],
}

describe('classifyMistake — 유형별 대표 케이스', () => {
  for (const [type, cases] of Object.entries(CASES) as [MistakeType, Case[]][]) {
    it(`${type} 3건을 정확히 분류한다`, () => {
      const got = cases.map(([headword, expected, answer]) =>
        classifyMistake({ headword, expected, answer }, ctx),
      )
      expect(got).toEqual([type, type, type])
    })
  }
})

describe('classifyMistake — 판정하지 않는 경우', () => {
  it('정답이면 null', () => {
    expect(classifyMistake({ headword: '構成', expected: 'こうせい', answer: 'こうせい' }, ctx)).toBeNull()
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: 'ガッコウ' }, ctx)).toBeNull()
  })

  it('빈 입력이면 null', () => {
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: '' }, ctx)).toBeNull()
  })

  it('어느 유형에도 안 맞는 오답이면 null — 억지로 붙이지 않는다', () => {
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: 'あいうえお' }, ctx)).toBeNull()
  })

  it('koSiblingOnyomi 를 안 주면 KO_INTERFERENCE 판정을 건너뛴다', () => {
    const bare: MistakeContext = { lookup: (k) => KANJI_FIXTURE[k] }
    expect(classifyMistake({ headword: '認識', expected: 'にんしき', answer: 'にんしょく' }, bare)).toBeNull()
  })
})

describe('classifyMistake — 경계 규칙', () => {
  it('답이 일본어로 파싱되면 KO_INTERFERENCE 로 가지 않는다', () => {
    // 発端 → はつたん 의 はつ 는 発 자신의 음독이다. PLAN §6 표대로 ONYOMI_CHOICE
    expect(classifyMistake({ headword: '発端', expected: 'ほったん', answer: 'はつたん' }, ctx))
      .toBe('ONYOMI_CHOICE')
  })

  it('促音便 실패에 딸려온 半濁音은 별개 오답으로 세지 않는다', () => {
    // はっぴょう → はつひょう 의 원인은 促音 하나다
    expect(classifyMistake({ headword: '発表', expected: 'はっぴょう', answer: 'はつひょう' }, contextFor({
      ...KANJI_FIXTURE,
      表: { onyomi: ['ヒョウ'], kunyomi: ['おもて', 'あらわ.す'], koreanH: ['표'] },
    }))).toBe('SOKUON')
  })

  it('원형이 장음 유무로만 갈리면 ONYOMI_CHOICE 가 아니라 CHOON', () => {
    // 数 는 ス 도 실재 음독이라 분해는 성공한다. 그래도 진단은 장음 누락이다
    expect(classifyMistake({ headword: '数字', expected: 'すうじ', answer: 'すじ' }, ctx)).toBe('CHOON')
  })
})

// 축약 고정본이 아니라 전체 KANJIDIC2 로도 같은 결과가 나오는지 본다
const kanjiPath = join('data', 'dict', 'kanji.json')
describe.runIf(existsSync(kanjiPath))('전체 KANJIDIC2 (data/dict/kanji.json)', () => {
  const kanji = JSON.parse(readFileSync(kanjiPath, 'utf8')).kanji
  const full = contextFor(kanji)

  it('고정본과 같은 판정을 낸다', () => {
    for (const [type, cases] of Object.entries(CASES) as [MistakeType, Case[]][]) {
      for (const [headword, expected, answer] of cases) {
        expect(classifyMistake({ headword, expected, answer }, full), `${headword} ${answer}`).toBe(type)
      }
    }
  })

  it('한자 1,000개 표본에 대해 예외 없이 판정한다', () => {
    const chars = Object.keys(kanji).slice(0, 1000)
    for (const c of chars) {
      expect(() => classifyMistake({ headword: c, expected: 'あ', answer: 'い' }, full)).not.toThrow()
    }
  })
})
