// 오답 상세 뷰모델 검증 — 음독 분해와 한국 한자음 병기, 같은 pairId 역인덱스
import { describe, expect, it } from 'vitest'
import { buildPairIndex } from '../dict/pairIndex.ts'
import type { KanjiInfo, OnyomiPair, RuntimeIdiom } from '../dict/load.ts'
import { breakdown, sharedIdioms } from './mistakeDetail.ts'

const pairs = new Map<string, OnyomiPair>([
  ['認:on:にん', { kanji: '認', base: 'にん', kind: 'on' }],
  ['識:on:しき', { kanji: '識', base: 'しき', kind: 'on' }],
  ['知:on:ち', { kanji: '知', base: 'ち', kind: 'on' }],
])

const kanji = new Map<string, KanjiInfo>([
  ['認', { kr: ['인'], on: ['ニン'], kun: ['みと.める'] }],
  ['識', { kr: ['식', '지'], on: ['シキ'], kun: [] }],
])

function idiom(id: string, headword: string, reading: string, pairIds: string[]): RuntimeIdiom {
  return {
    idiomId: id, band: 1, category: 1, classSource: 'default', pairIds,
    headword, reading, pos: ['n'], common: true, koMeaning: null,
  }
}

const pool: RuntimeIdiom[] = [
  idiom('1', '認識', 'にんしき', ['認:on:にん', '識:on:しき']),
  idiom('2', '認知', 'にんち', ['認:on:にん', '知:on:ち']),
  idiom('3', '知識', 'ちしき', ['知:on:ち', '識:on:しき']),
]

describe('breakdown', () => {
  it('pairIds 를 (한자, 음독) 조각으로 펼치고 한국 한자음을 병기한다', () => {
    const parts = breakdown(pool[0], pairs, kanji)
    expect(parts).toEqual([
      { pairId: '認:on:にん', kanji: '認', base: 'にん', kind: 'on', kr: ['인'] },
      { pairId: '識:on:しき', kanji: '識', base: 'しき', kind: 'on', kr: ['식', '지'] },
    ])
  })

  it('pairs 사전에 없는 pairId 는 건너뛴다', () => {
    const parts = breakdown(idiom('x', '未知', 'みち', ['未:on:み', '知:on:ち']), pairs, kanji)
    expect(parts.map((p) => p.kanji)).toEqual(['知'])
  })

  it('kanji 사전에 없으면 한국음은 빈 배열이다', () => {
    const parts = breakdown(pool[1], pairs, kanji)
    expect(parts[1]).toMatchObject({ kanji: '知', kr: [] })
  })
})

describe('sharedIdioms (buildPairIndex 역인덱스)', () => {
  const index = buildPairIndex(pool)

  it('같은 pairId 를 쓰는 다른 숙어를 자기 자신을 빼고 준다', () => {
    expect(sharedIdioms('認:on:にん', index, '1')).toEqual([
      { id: '2', headword: '認知', reading: 'にんち' },
    ])
  })

  it('limit 로 개수를 제한한다', () => {
    expect(sharedIdioms('識:on:しき', index, '999', 1)).toHaveLength(1)
    expect(sharedIdioms('識:on:しき', index, '999', 5)).toHaveLength(2)
  })

  it('아무도 안 쓰는 pairId 는 빈 배열이다', () => {
    expect(sharedIdioms('無:on:む', index, '1')).toEqual([])
  })
})
