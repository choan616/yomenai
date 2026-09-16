// 읽기 역인덱스 — 정확 일치 우선, 앞부분 일치, altReadings, 카타카나 정규화
import { describe, expect, it } from 'vitest'
import { buildReadingIndex, searchByReading } from './readingIndex.ts'
import type { RuntimeIdiom } from './load.ts'

const mk = (id: string, headword: string, reading: string, alt?: string[]): RuntimeIdiom => ({
  idiomId: id,
  band: 1,
  category: 2,
  classSource: 'default',
  pairIds: [],
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
