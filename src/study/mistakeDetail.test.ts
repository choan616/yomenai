// 오답 상세 뷰모델 검증 — 음독 분해와 한국 한자음 병기, 같은 pairId 역인덱스
import { describe, expect, it } from 'vitest'
import { buildPairIndex } from '../dict/pairIndex.ts'
import type { KanjiInfo, OnyomiPair, RuntimeIdiom } from '../dict/load.ts'
import { KANJI_FIXTURE } from '../core/mistakes.fixture.ts'
import { breakdown, contrastGroups, sharedIdioms } from './mistakeDetail.ts'

const pairs = new Map<string, OnyomiPair>([
  ['認:on:にん', { kanji: '認', base: 'にん', kind: 'on' }],
  ['識:on:しき', { kanji: '識', base: 'しき', kind: 'on' }],
  ['知:on:ち', { kanji: '知', base: 'ち', kind: 'on' }],
])

const kanji = new Map<string, KanjiInfo>([
  ['認', { kr: ['인'], krOld: [], on: ['ニン'], kun: ['みと.める'] }],
  ['識', { kr: ['식'], krOld: ['지'], on: ['シキ'], kun: [] }],
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
  it('pairIds 를 (한자, 음독) 조각으로 펼치고 한국 한자음을 병기한다 (옛 음은 krOld 로)', () => {
    const parts = breakdown(pool[0], pairs, kanji)
    expect(parts).toEqual([
      { pairId: '認:on:にん', kanji: '認', base: 'にん', kind: 'on', kr: ['인'], krOld: [] },
      { pairId: '識:on:しき', kanji: '識', base: 'しき', kind: 'on', kr: ['식'], krOld: ['지'] },
    ])
  })

  it('pairs 사전에 없는 pairId 는 건너뛴다', () => {
    const parts = breakdown(idiom('x', '未知', 'みち', ['未:on:み', '知:on:ち']), pairs, kanji)
    expect(parts.map((p) => p.kanji)).toEqual(['知'])
  })

  it('kanji 사전에 없으면 한국음은 빈 배열이다', () => {
    const parts = breakdown(pool[1], pairs, kanji)
    expect(parts[1]).toMatchObject({ kanji: '知', kr: [], krOld: [] })
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

describe('contrastGroups — 표면형으로 갈라 대조군을 만든다', () => {
  const lookup = (k: string) => KANJI_FIXTURE[k]
  const GAKU = '学:on:がく'
  // 学校 がっ / 学食·学者 がく — 같은 원형이 다르게 소리 나는 실제 예
  const cPool: RuntimeIdiom[] = [
    idiom('g1', '学校', 'がっこう', [GAKU, '校:on:こう']),
    idiom('g2', '学食', 'がくしょく', [GAKU, '食:on:しょく']),
    idiom('g3', '学識', 'がくしき', [GAKU, '識:on:しき']),
  ]
  const cIndex = buildPairIndex(cPool)

  it('표면형이 다르면 군이 갈린다', () => {
    const g = contrastGroups(GAKU, 'がく', cIndex, lookup, 'g1')
    expect(g).toHaveLength(2)
    expect(g.map((x) => x.surface).sort()).toEqual(['がく', 'がっ'])
  })

  it('지금 틀린 숙어가 속한 군이 먼저 오고 그 안에서도 맨 앞이다', () => {
    const g = contrastGroups(GAKU, 'がく', cIndex, lookup, 'g1')
    expect(g[0].surface).toBe('がっ')
    expect(g[0].current).toBe(true)
    expect(g[0].idioms[0].headword).toBe('学校')
    expect(g[1].current).toBe(false)
  })

  it('원형 그대로인 군에만 plain 이 선다', () => {
    const g = contrastGroups(GAKU, 'がく', cIndex, lookup, 'g1')
    expect(g.find((x) => x.surface === 'がく')!.plain).toBe(true)
    expect(g.find((x) => x.surface === 'がっ')!.plain).toBe(false)
  })

  it('total 은 자르기 전 총수, idioms 는 잘린 목록', () => {
    const g = contrastGroups(GAKU, 'がく', cIndex, lookup, 'g1', 1)
    const plain = g.find((x) => x.surface === 'がく')!
    expect(plain.total).toBe(2)
    expect(plain.idioms).toHaveLength(1)
  })

  it('표면형이 하나뿐이면 군도 하나 — 화면은 이때 평평한 목록으로 돌아간다', () => {
    const one = buildPairIndex([cPool[1], cPool[2]])
    expect(contrastGroups(GAKU, 'がく', one, lookup, 'g2')).toHaveLength(1)
  })

  it('분해가 안 되는 숙어는 빠진다', () => {
    const withBad = buildPairIndex([...cPool, idiom('g4', '謎学', 'なぞがく', [GAKU])])
    const g = contrastGroups(GAKU, 'がく', withBad, lookup, 'g1')
    expect(g.flatMap((x) => x.idioms).some((s) => s.id === 'g4')).toBe(false)
  })
})
