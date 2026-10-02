// JMdict 항목에서 임포트가 떨어뜨린 읽기를 뽑는 규칙 검증 — 뜻이 갈린 읽기와 같은 읽기를 가른다
import { describe, expect, it } from 'vitest'
import { extractExtras, type ExtractStats } from './build-extra-readings.ts'

type El = Record<string, unknown>
const kEle = (keb: string, pri: string[] = []): El => ({ keb, ke_pri: pri })
const rEle = (reb: string, extra: El = {}): El => ({ reb, ...extra })
const sense = (gloss: string[], extra: El = {}): El => ({ gloss, ...extra })

/** 逆手 (id 1693370) 를 본뜬 항목 — 읽기 둘, 뜻 일부가 읽기 전용 */
const sakate: El = {
  ent_seq: '1693370',
  k_ele: [kEle('逆手', ['nf30'])],
  r_ele: [rEle('さかて'), rEle('ぎゃくて', { re_pri: ['nf30'] })],
  sense: [
    sense(['cross-handed grip']),
    sense(['reverse grip'], { stagr: ['さかて'] }),
    sense(['turning the tables']),
    sense(['foul trick'], { stagr: ['ぎゃくて'] }),
  ],
}

describe('extractExtras', () => {
  it('읽기 전용 뜻이 있는 읽기는 split 이다 — 공통 뜻과 전용 뜻이 같이 실린다', () => {
    const ex = extractExtras(sakate, '逆手', 'さかて')
    expect(ex.plain).toEqual([])
    expect(ex.split).toHaveLength(1)
    const s = ex.split[0]!
    expect(s.reading).toBe('ぎゃくて')
    // ぎゃくて 에 적용되는 뜻 = 공통 둘 + 전용 하나 (さかて 전용 뜻은 빠진다)
    expect(s.senses).toEqual([['cross-handed grip'], ['turning the tables'], ['foul trick']])
    expect(s.own).toEqual([2])
  })

  it('우선순위는 그 읽기 자신의 것만 싣는다 — 표기의 순위를 물려받지 않는다', () => {
    const s = extractExtras(sakate, '逆手', 'さかて').split[0]!
    expect(s.readingPriority).toEqual(['nf30'])
    // 표기(逆手)에는 nf30 이 있지만 읽기 쪽 표시가 없으면 비어 있다.
    // 합치면 모든 읽기가 표기의 순위를 공짜로 얻는다 — 平日 ひらび(부수 日 의 이름)가 밴드 0 으로
    // 들어온 사고가 이것이었다 (실측: 후보 217개 중 자기 우선순위가 있는 읽기는 10개)
    const noRePri: El = { ...sakate, r_ele: [rEle('さかて'), rEle('ぎゃくて')] }
    expect(extractExtras(noRePri, '逆手', 'さかて').split[0]!.readingPriority).toEqual([])
  })

  it('분할되면 대표 읽기에 적용되는 뜻도 같이 준다', () => {
    const ex = extractExtras(sakate, '逆手', 'さかて')
    expect(ex.parentSenses).toEqual([['cross-handed grip'], ['reverse grip'], ['turning the tables']])
  })

  it('뜻이 같은 읽기는 plain 이다 (御前 おまえ/おまい)', () => {
    const omae: El = {
      ent_seq: '1',
      k_ele: [kEle('御前')],
      r_ele: [rEle('おまえ'), rEle('おまい')],
      sense: [sense(['you'])],
    }
    const ex = extractExtras(omae, '御前', 'おまえ')
    expect(ex.plain).toEqual(['おまい'])
    expect(ex.split).toEqual([])
    expect(ex.parentSenses).toBeUndefined()
  })

  it('대표 읽기에만 걸린 뜻이 있어도 다른 읽기는 plain 이다 — 부분집합이라 나눌 값이 없다', () => {
    const e: El = {
      ent_seq: '2',
      k_ele: [kEle('甲乙')],
      r_ele: [rEle('こうおつ'), rEle('かぶとおつ')],
      sense: [sense(['common']), sense(['primary only'], { stagr: ['こうおつ'] })],
    }
    const ex = extractExtras(e, '甲乙', 'こうおつ')
    expect(ex.plain).toEqual(['かぶとおつ'])
    expect(ex.split).toEqual([])
  })

  it('다른 표기에만 걸린 뜻(stagk)은 이 표기의 뜻이 아니다', () => {
    const e: El = {
      ent_seq: '3',
      k_ele: [kEle('甲乙'), kEle('乙甲')],
      r_ele: [rEle('こうおつ'), rEle('おつこう')],
      sense: [sense(['for the other spelling'], { stagr: ['おつこう'], stagk: ['乙甲'] })],
    }
    // 이 표기(甲乙)로는 おつこう 전용 뜻이 없다 → 뜻이 갈렸다고 볼 수 없다
    const ex = extractExtras(e, '甲乙', 'こうおつ')
    expect(ex.split).toEqual([])
    expect(ex.plain).toEqual(['おつこう'])
  })

  it('고어·희귀 읽기(읽기 표시)와 가타카나 읽기와 한자 없는 읽기는 뺀다', () => {
    const e: El = {
      ent_seq: '4',
      k_ele: [kEle('麦酒')],
      r_ele: [
        rEle('ばくしゅ'),
        rEle('むぎざけ', { re_inf: ['&ok;'] }),
        rEle('ビール'),
        rEle('ひーる', { re_nokanji: '' }),
      ],
      sense: [sense(['beer'])],
    }
    const stats: ExtractStats = { tagged: 0, katakana: 0, nokanji: 0, otherSpelling: 0, sameSound: 0 }
    const ex = extractExtras(e, '麦酒', 'ばくしゅ', stats)
    expect(ex.plain).toEqual([])
    expect(ex.split).toEqual([])
    expect(stats).toEqual({ tagged: 1, katakana: 1, nokanji: 1, otherSpelling: 0, sameSound: 0 })
  })

  it('다른 표기 전용 읽기(re_restr)는 뺀다', () => {
    const e: El = {
      ent_seq: '5',
      k_ele: [kEle('甲乙'), kEle('乙甲')],
      r_ele: [rEle('こうおつ'), rEle('おつこう', { re_restr: ['乙甲'] })],
      sense: [sense(['x'])],
    }
    const stats: ExtractStats = { tagged: 0, katakana: 0, nokanji: 0, otherSpelling: 0, sameSound: 0 }
    const ex = extractExtras(e, '甲乙', 'こうおつ', stats)
    expect(ex.plain).toEqual([])
    expect(stats.otherSpelling).toBe(1)
  })

  it('그 읽기 전용 뜻이 전부 고어·폐어면 별도 항목이 아니라 채점만 받는다', () => {
    const e: El = {
      ent_seq: '1529680',
      k_ele: [kEle('無塩')],
      r_ele: [rEle('むえん'), rEle('ぶえん')],
      sense: [
        sense(['salt free']),
        sense(['raw fish'], { stagr: ['ぶえん'], misc: ['&arch;'] }),
        sense(['ugly woman'], { stagr: ['ぶえん'], misc: ['&obs;'] }),
      ],
    }
    const ex = extractExtras(e, '無塩', 'むえん')
    expect(ex.split).toEqual([])
    expect(ex.plain).toEqual(['ぶえん'])
  })

  it('고어가 아닌 전용 뜻이 하나라도 있으면 별도 항목 후보다 (낡은 말 dated 는 거르지 않는다)', () => {
    const e: El = {
      ent_seq: '1529680',
      k_ele: [kEle('無塩')],
      r_ele: [rEle('むえん'), rEle('ぶえん')],
      sense: [
        sense(['salt free']),
        sense(['raw fish'], { stagr: ['ぶえん'], misc: ['&arch;'] }),
        sense(['old-fashioned thing'], { stagr: ['ぶえん'], misc: ['&dated;'] }),
      ],
    }
    const ex = extractExtras(e, '無塩', 'むえん')
    expect(ex.split.map((s) => s.reading)).toEqual(['ぶえん'])
    // 고어 뜻은 own 에 안 든다 — 인덱스는 이 읽기에 적용되는 뜻 기준이다 (공통 1, 고어 1, 낡은 말 1)
    expect(ex.split[0]!.own).toEqual([2])
  })

  it('소리가 같은 표기 변이(ぢ/づ)는 별개 읽기가 아니다 — 連中 れんじゅう/れんぢゅう', () => {
    // 실제 데이터가 빌드에서 잡아 준 사고: 두 읽기의 로마자가 같아 형제 id 가 겹쳤다
    const e: El = {
      ent_seq: '1559700',
      k_ele: [kEle('連中')],
      r_ele: [rEle('れんちゅう'), rEle('れんじゅう'), rEle('れんぢゅう')],
      sense: [sense(['group']), sense(['fellows'], { stagr: ['れんじゅう'] })],
    }
    const stats: ExtractStats = { tagged: 0, katakana: 0, nokanji: 0, otherSpelling: 0, sameSound: 0 }
    const ex = extractExtras(e, '連中', 'れんちゅう', stats)
    // 먼저 온 れんじゅう 만 남고 れんぢゅう 는 같은 소리라 빠진다
    expect(ex.split.map((s) => s.reading)).toEqual(['れんじゅう'])
    expect(stats.sameSound).toBe(1)
  })

  it('대표 읽기와 소리만 다르게 쓴 읽기도 뺀다 (はなぢ ↔ はなじ)', () => {
    const e: El = {
      ent_seq: '8',
      k_ele: [kEle('鼻血')],
      r_ele: [rEle('はなぢ'), rEle('はなじ')],
      sense: [sense(['nosebleed'])],
    }
    expect(extractExtras(e, '鼻血', 'はなぢ')).toEqual({ plain: [], split: [] })
  })

  it('읽기가 하나뿐이면 아무것도 안 낸다', () => {
    const e: El = { ent_seq: '6', k_ele: [kEle('日本')], r_ele: [rEle('にほん')], sense: [sense(['Japan'])] }
    expect(extractExtras(e, '日本', 'にほん')).toEqual({ plain: [], split: [] })
  })
})
