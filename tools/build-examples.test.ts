// pickExamples·readingHolds 단위 테스트 — 길이 상한 필터 + 짧은 순 정렬 + 중복 제거 + 읽기 검증
import { describe, expect, it } from 'vitest'
import { pickExamples, readingHolds } from './build-examples.ts'

describe('pickExamples', () => {
  it('짧은 순으로 최대 max 개를 고른다', () => {
    const got = pickExamples(['ccc', 'a', 'bb'], 2)
    expect(got).toEqual(['a', 'bb'])
  })

  it('길이 상한을 넘는 문장은 뺀다', () => {
    const got = pickExamples(['短い文', 'とても長くて読みにくい可能性がある例文です'], 3, 5)
    expect(got).toEqual(['短い文'])
  })

  it('중복 문장은 한 번만 센다', () => {
    const got = pickExamples(['同じ文', '同じ文', '同じ文'], 3)
    expect(got).toEqual(['同じ文'])
  })

  it('후보가 없으면 빈 배열', () => {
    expect(pickExamples([])).toEqual([])
  })

  it('전부 상한을 넘으면 빈 배열 — 억지로 긴 문장을 끼워넣지 않는다', () => {
    expect(pickExamples(['아주 긴 문장입니다 매우 매우 매우 깁니다'], 3, 5)).toEqual([])
  })
})

describe('pickExamples — accept', () => {
  it('accept 가 거른 문장은 건너뛰고 다음 후보로 채운다', () => {
    const got = pickExamples(['aa', 'bb', 'cc'], 2, 10, (s) => s !== 'aa')
    expect(got).toEqual(['bb', 'cc'])
  })

  it('max 를 채우면 남은 후보는 검사하지 않는다 — 형태소 분석이 비싸다', () => {
    const seen: string[] = []
    pickExamples(['a', 'bb', 'ccc'], 1, 10, (s) => {
      seen.push(s)
      return true
    })
    expect(seen).toEqual(['a'])
  })
})

describe('readingHolds', () => {
  it('日照り(ヒデリ) 안의 日照 는 にっしょう 로 안 읽힌다', () => {
    const ms = [{ position: 0, surface: '日照り', reading: 'ヒデリ' }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })

  it('日照時間 의 日照 는 살린다 — 형태소가 갈라지고 읽기가 그대로다', () => {
    const ms = [
      { position: 0, surface: '日照', reading: 'ニッショウ' },
      { position: 2, surface: '時間', reading: 'ジカン' },
    ]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(true)
  })

  it('弁護士(ベンゴシ) 한 덩어리 안의 弁護 는 살린다 — 읽기가 보존된다', () => {
    const ms = [{ position: 0, surface: '弁護士', reading: 'ベンゴシ' }]
    expect(readingHolds(ms, 0, '弁護', 'べんご')).toBe(true)
  })

  it('国家/主義 경계에 걸친 家主 는 뺀다', () => {
    const ms = [
      { position: 0, surface: '国家', reading: 'コッカ' },
      { position: 2, surface: '主義', reading: 'シュギ' },
    ]
    expect(readingHolds(ms, 1, '家主', 'やぬし')).toBe(false)
  })

  it('구간 밖 형태소의 읽기는 안 센다', () => {
    const ms = [
      { position: 0, surface: '不作', reading: 'フサク' },
      { position: 2, surface: 'は', reading: 'ハ' },
      { position: 3, surface: '日照', reading: 'ニッショウ' },
    ]
    expect(readingHolds(ms, 3, '日照', 'にっしょう')).toBe(true)
  })

  it('표기가 통째로 안 맞는 형태소가 읽기까지 없으면 판정하지 않고 뺀다', () => {
    const ms = [{ position: 0, surface: '日照り', reading: undefined }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 음운 변형과 경계', () => {
  it('IPADIC 이 一/回 로 갈라 イチ+カイ 를 줘도 いっかい 로 본다 (促音便)', () => {
    const ms = [
      { position: 0, surface: '一', reading: 'イチ' },
      { position: 1, surface: '回', reading: 'カイ' },
    ]
    expect(readingHolds(ms, 0, '一回', 'いっかい')).toBe(true)
  })

  it('稲妻 イナヅマ 와 いなずま 는 現代仮名遣い 차이일 뿐이다', () => {
    const ms = [{ position: 0, surface: '稲妻', reading: 'イナヅマ' }]
    expect(readingHolds(ms, 0, '稲妻', 'いなずま')).toBe(true)
  })

  it('万一|戦争 에 걸친 一戦 은 양쪽 끝이 다 형태소 중간이라 뺀다', () => {
    const ms = [
      { position: 0, surface: '万一', reading: 'マンイチ' },
      { position: 2, surface: '戦争', reading: 'センソウ' },
    ]
    expect(readingHolds(ms, 1, '一戦', 'いっせん')).toBe(false)
  })

  it('걸치는 형태소가 없으면 false — 자리를 잘못 받은 경우', () => {
    const ms = [{ position: 0, surface: '猫', reading: 'ネコ' }]
    expect(readingHolds(ms, 5, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 동형이독', () => {
  it('형태소 하나와 표기가 통째로 맞으면 IPADIC 이 다른 읽기를 줘도 받는다 (日本人 ニッポンジン)', () => {
    const ms = [{ position: 0, surface: '日本人', reading: 'ニッポンジン' }]
    expect(readingHolds(ms, 0, '日本人', 'にほんじん')).toBe(true)
  })

  it('표기가 더 긴 형태소면 통째 일치가 아니라 읽기로 판정한다 (日照り)', () => {
    const ms = [{ position: 0, surface: '日照り', reading: 'ヒデリ' }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 읽기를 모르는 형태소', () => {
  it('표기가 통째로 맞으면 읽기를 몰라도 받는다 — 未知語여도 그 단어가 거기 있다 (拒食症)', () => {
    const ms = [{ position: 0, surface: '拒食症', reading: undefined }]
    expect(readingHolds(ms, 0, '拒食症', 'きょしょくしょう')).toBe(true)
  })
})
