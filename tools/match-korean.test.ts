// match-korean 분류 로직 검증 — 후보 생성·原語 대조·3분류, 그리고 알려진 동형이의어 10개가 검수 큐로 가는지
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { DICT_DIR } from './lib/dict.ts'
import { loadVariantSets } from './lib/kanji-variants.ts'
import {
  expandRepetition,
  normalizeOrigin,
  koreanCandidates,
  originMatches,
  classify,
  type StdictItem,
} from './lib/korean.ts'

const { kanji } = JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
  kanji: Record<string, { koreanH?: string[] }>
}
const variants = loadVariantSets()

const stub = (word: string, origin: string, def = ''): StdictItem => ({
  word,
  supNo: '',
  origin,
  senses: [{ definition: def }],
  link: '',
})

describe('전처리', () => {
  it('々 를 앞 글자로 펼친다', () => {
    expect(expandRepetition('段々')).toBe('段段')
    expect(expandRepetition('時々刻々')).toBe('時時刻刻')
  })
  it('origin 에서 한자만 남긴다', () => {
    expect(normalizeOrigin('←汽車')).toBe('汽車')
    expect(normalizeOrigin('汽車/기차')).toBe('汽車')
  })
})

describe('한국어 한자음 후보', () => {
  it('데카르트 곱을 만든다', () => {
    expect(koreanCandidates('汽車', kanji, variants).sort()).toEqual(
      ['기거', '기차', '흘거', '흘차'].sort(),
    )
    expect(koreanCandidates('工夫', kanji, variants)).toEqual(['공부'])
  })
  it('한자음 없는 이체자는 정자에서 보강한다 (収 → 收 → 수)', () => {
    expect(koreanCandidates('収入', kanji, variants)).toContain('수입')
  })
  it('국자(枠)처럼 대응 한자음이 없으면 빈 배열', () => {
    expect(koreanCandidates('入枠', kanji, variants)).toEqual([])
  })
})

describe('原語 대조 (신자체 ↔ 정자)', () => {
  it('같은 글자는 일치', () => {
    expect(originMatches('汽車', '汽車', variants)).toBe(true)
  })
  it('신자체 ↔ 정자 이체 관계는 일치 (医学 ↔ 醫學)', () => {
    expect(originMatches('医学', '醫學', variants)).toBe(true)
    expect(originMatches('経済', '經濟', variants)).toBe(true)
  })
  it('음만 같고 글자가 다르면 불일치 (手紙 ↔ 收支)', () => {
    expect(originMatches('手紙', '收支', variants)).toBe(false)
  })
  it('길이가 다르면 불일치', () => {
    expect(originMatches('放心', '放', variants)).toBe(false)
  })
  it('々 표제어도 펼쳐서 대조 (段々 ↔ 段段)', () => {
    expect(originMatches('段々', '段段', variants)).toBe(true)
  })
})

describe('분류', () => {
  it('stdict 결과가 없으면 일본 고유', () => {
    const c = classify([], '過払', variants)
    expect(c.category).toBe('JP_UNIQUE')
    expect(c.tentativeCategory).toBe(3)
  })
  it('原語가 일치하면 검수 필요 + originMatch', () => {
    const c = classify([stub('공부', '工夫', '학문이나 기술을 배우고 익힘')], '工夫', variants)
    expect(c.category).toBe('NEEDS_REVIEW')
    expect(c.tentativeCategory).toBe(2)
    expect(c.hasOriginMatch).toBe(true)
  })
  it('음만 겹쳐도(原語 불일치) 검수 필요 — KO 간섭 위험', () => {
    const c = classify([stub('수지', '收支', '수입과 지출')], '手紙', variants)
    expect(c.category).toBe('NEEDS_REVIEW')
    expect(c.hasOriginMatch).toBe(false)
  })
})

// Phase 3 완료 기준: 알려진 동형이의어가 전부 검수 큐(잠정 2번)로 들어가야 한다.
// 실제 stdict 응답을 흉내낸 최소 fixture로 분류 경로를 고정한다.
describe('알려진 동형이의어 10개 → 검수 큐(잠정 2번)', () => {
  const cases: [string, StdictItem[]][] = [
    ['愛人', [stub('애인', '愛人', '서로 사랑하는 사람')]],
    ['汽車', [stub('기차', '汽車', '여러 개의 찻간을 잇대어 궤도 위를 달리는 차')]],
    ['手紙', [stub('수지', '收支', '수입과 지출')]], // 原語 불일치지만 音 간섭
    ['大丈夫', [stub('대장부', '大丈夫', '건장하고 씩씩한 사내')]],
    ['工夫', [stub('공부', '工夫', '학문이나 기술을 배우고 익힘')]],
    ['放心', [stub('방심', '放心', '마음을 다잡지 아니하고 풀어 놓아 버림')]],
    ['都合', [stub('도합', '都合', '모두 합한 셈')]],
    ['主人', [stub('주인', '主人', '한 집안을 이끌어 나가는 사람')]],
    ['我慢', [stub('아만', '我慢', '자신을 뽐내며 남을 업신여기는 마음')]],
    ['勉強', [stub('면강', '勉強', '억지로 하거나 시킴')]],
  ]
  for (const [headword, items] of cases) {
    it(headword, () => {
      const c = classify(items, headword, variants)
      expect(c.category).toBe('NEEDS_REVIEW')
      expect(c.tentativeCategory).toBe(2)
    })
  }
})
