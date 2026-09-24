// 읽기 역인덱스 — 정확 일치 우선, 앞부분 일치, altReadings, 카타카나 정규화
import { describe, expect, it } from 'vitest'
import {
  buildReadingIndex,
  looksLikeHeadword,
  searchByHeadword,
  searchByReading,
} from './readingIndex.ts'
import type { RuntimeIdiom } from './load.ts'

const mk = (id: string, headword: string, reading: string, alt?: string[]): RuntimeIdiom => ({
  idiomId: id,
  band: 1,
  category: 2,
  classSource: 'default',
  pairIds: [],
  readingKind: 'on',
  headword,
  reading,
  altReadings: alt,
  pos: ['n'],
  common: true,
  koMeaning: null,
})

const POOL = [
  mk('1', '光輝', 'こうき'),
  mk('2', '好機', 'こうき'),
  mk('3', '交渉', 'こうしょう'),
  mk('4', '公証人', 'こうしょうにん'),
  mk('5', '世界', 'せかい'),
  mk('6', '御前', 'おまえ', ['おんまえ', 'ごぜん']),
]
const INDEX = buildReadingIndex(POOL)

describe('buildReadingIndex', () => {
  it('같은 읽기의 숙어를 한 키에 등장 순서대로 모은다', () => {
    expect(INDEX.byReading.get('こうき')?.map((i) => i.headword)).toEqual(['光輝', '好機'])
  })

  it('altReadings 도 키로 들어간다', () => {
    expect(INDEX.byReading.get('おんまえ')?.map((i) => i.headword)).toEqual(['御前'])
    expect(INDEX.byReading.get('ごぜん')?.map((i) => i.headword)).toEqual(['御前'])
  })

  it('키 배열이 정렬돼 있다', () => {
    expect(INDEX.keys).toEqual([...INDEX.keys].sort())
  })
})

describe('searchByReading', () => {
  it('정확 일치 묶음이 맨 앞이고 exact 로 표시된다', () => {
    const got = searchByReading(INDEX, 'こうしょう')
    expect(got[0]?.reading).toBe('こうしょう')
    expect(got[0]?.exact).toBe(true)
    expect(got[0]?.items.map((i) => i.headword)).toEqual(['交渉'])
  })

  it('앞부분 일치 묶음이 뒤따른다', () => {
    const got = searchByReading(INDEX, 'こうしょう')
    expect(got.map((g) => g.reading)).toEqual(['こうしょう', 'こうしょうにん'])
    expect(got[1]?.exact).toBe(false)
  })

  it('정확 일치가 없어도 앞부분 일치만으로 낸다', () => {
    const got = searchByReading(INDEX, 'こうき')
    expect(got.map((g) => g.reading)).toEqual(['こうき'])
    const partial = searchByReading(INDEX, 'こうし')
    expect(partial.map((g) => g.reading)).toEqual(['こうしょう', 'こうしょうにん'])
    expect(partial.every((g) => !g.exact)).toBe(true)
  })

  it('카타카나·장음부 입력을 히라가나로 접는다', () => {
    expect(searchByReading(INDEX, 'コウキ')[0]?.reading).toBe('こうき')
    expect(searchByReading(INDEX, 'セカイ')[0]?.items[0]?.headword).toBe('世界')
  })

  it('앞뒤 공백을 무시하고, 빈 쿼리는 전량을 쏟지 않는다', () => {
    expect(searchByReading(INDEX, '  せかい  ')[0]?.reading).toBe('せかい')
    expect(searchByReading(INDEX, '')).toEqual([])
    expect(searchByReading(INDEX, '   ')).toEqual([])
  })

  it('없는 읽기는 빈 결과다', () => {
    expect(searchByReading(INDEX, 'ありがとう')).toEqual([])
  })

  it('묶음 수를 상한으로 자른다', () => {
    expect(searchByReading(INDEX, 'こう', 1).map((g) => g.reading)).toEqual(['こうき'])
    expect(searchByReading(INDEX, 'こう').length).toBe(3)
  })
})

describe('표기로 찾기 (2026-09-24)', () => {
  // 같은 표기를 달리 읽는 항목 — 읽기 묶음이 둘로 갈려야 한다
  const POOL2 = [...POOL, mk('7', '生物', 'せいぶつ'), mk('8', '生物', 'なまもの')]
  const IDX2 = buildReadingIndex(POOL2)

  it('한자가 섞였는지로 가른다', () => {
    expect(looksLikeHeadword('交渉')).toBe(true)
    expect(looksLikeHeadword('抑々')).toBe(true)
    expect(looksLikeHeadword('こうしょう')).toBe(false)
    expect(looksLikeHeadword('kousho')).toBe(false)
  })

  it('표기를 정확히 치면 그 숙어가 읽기 묶음으로 나온다', () => {
    const got = searchByHeadword(INDEX, '交渉')
    expect(got).toHaveLength(1)
    expect(got[0]?.reading).toBe('こうしょう')
    expect(got[0]?.exact).toBe(true)
    expect(got[0]?.items.map((i) => i.headword)).toEqual(['交渉'])
  })

  it('앞부분만 쳐도 찾고, 정확 일치가 맨 앞이다', () => {
    const got = searchByHeadword(INDEX, '公証')
    expect(got[0]?.items.map((i) => i.headword)).toEqual(['公証人'])
    expect(got[0]?.exact).toBe(false)
  })

  it('**같은 표기를 달리 읽으면 묶음이 갈린다** — 알고 싶은 게 읽기라 갈려야 답이 된다', () => {
    const got = searchByHeadword(IDX2, '生物')
    expect(got.map((g) => g.reading)).toEqual(['せいぶつ', 'なまもの'])
    expect(got.every((g) => g.exact)).toBe(true)
  })

  it('없는 표기는 빈 결과다', () => {
    expect(searchByHeadword(INDEX, '爆轟')).toEqual([])
    expect(searchByHeadword(INDEX, '  ')).toEqual([])
  })

  it('묶음 수 상한을 지킨다', () => {
    expect(searchByHeadword(IDX2, '生物', 1)).toHaveLength(1)
  })

  it('표기 키 배열이 정렬돼 있다', () => {
    expect(IDX2.headKeys).toEqual([...IDX2.headKeys].sort())
  })
})
