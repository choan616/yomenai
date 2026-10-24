// 굳은 오답 출처 실측의 순수 함수 검증 — 조각 정렬, 경계 차이, 굳은 오답 선택, 학습 시점 판정, 서로 거꾸로 짝
import { describe, expect, it } from 'vitest'
import {
  alignWrong,
  analyze,
  boundaryKind,
  mulberry32,
  repeatedWrong,
  sample,
  type Chunk,
  type DictIdiom,
} from './audit-wrong-source.ts'
import type { MistakeType, ReviewEvent } from '../src/core/types.ts'
import type { KanjiReadings } from '../src/lib/onyomi.ts'

let seq = 0
function ev(
  idiomId: string,
  at: number,
  correct: boolean,
  answer = '',
  mistakeType: MistakeType | null = null,
): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(5, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at,
    idiomId,
    cardType: 'reading',
    mistakeType,
    deletedAt: null,
    type: 'review',
    grade: correct ? 3 : 1,
    answer,
    expected: 'x',
    correct,
    elapsedMs: 1000,
  }
}

const chunks = (...pairs: [string, string][]): Chunk[] => pairs.map(([kanji, surface]) => ({ kanji, surface }))

describe('alignWrong', () => {
  const sunako = chunks(['砂', 'すな'], ['子', 'ご'])

  it('한 조각만 틀리면 그 조각을 돌려준다', () => {
    expect(alignWrong(sunako, 'すなこ')).toEqual({ ok: true, index: 1, kanji: '子', expected: 'ご', wrong: 'こ' })
    expect(alignWrong(sunako, 'さなご')).toEqual({ ok: true, index: 0, kanji: '砂', expected: 'すな', wrong: 'さな' })
  })

  it('조각이 둘 이상 틀리면 NO_SINGLE', () => {
    expect(alignWrong(sunako, 'さなこ')).toEqual({ ok: false, reason: 'NO_SINGLE' })
  })

  it('조각을 통째로 빠뜨리면 NO_SINGLE', () => {
    expect(alignWrong(sunako, 'すな')).toEqual({ ok: false, reason: 'NO_SINGLE' })
  })

  it('기대 읽기 분해가 없으면 NO_PARSE', () => {
    expect(alignWrong(null, 'すなこ')).toEqual({ ok: false, reason: 'NO_PARSE' })
  })

  it('장음 삽입처럼 경계에 걸친 답은 W 의 분해로 가리고, 분해가 없으면 AMBIGUOUS', () => {
    const horyu = chunks(['保', 'ほ'], ['留', 'りゅう'])
    expect(alignWrong(horyu, 'ほうりゅう')).toEqual({ ok: false, reason: 'AMBIGUOUS' })
    expect(alignWrong(horyu, 'ほうりゅう', chunks(['保', 'ほう'], ['留', 'りゅう']))).toEqual({
      ok: true,
      index: 0,
      kanji: '保',
      expected: 'ほ',
      wrong: 'ほう',
    })
    // W 의 분해가 다른 쪽 조각을 가리키면 그쪽을 택한다
    expect(alignWrong(horyu, 'ほうりゅう', chunks(['保', 'ほ'], ['留', 'うりゅう']))).toEqual({
      ok: true,
      index: 1,
      kanji: '留',
      expected: 'りゅう',
      wrong: 'うりゅう',
    })
  })
})

describe('boundaryKind', () => {
  it('탁음·촉음·장음 차이만 가린다', () => {
    expect(boundaryKind('すなご', 'すなこ')).toBe('voicing')
    expect(boundaryKind('はったつ', 'はつたつ')).toBe('sokuon')
    expect(boundaryKind('とくちょう', 'とくちょ')).toBe('choon')
  })

  it('다른 읽기이거나 같으면 null', () => {
    expect(boundaryKind('かんこう', 'こうぎょう')).toBeNull()
    expect(boundaryKind('かんこう', 'かんこう')).toBeNull()
  })
})

describe('repeatedWrong', () => {
  it('누적 오답 3회 미만이면 null', () => {
    expect(repeatedWrong([ev('a', 1, false, 'p'), ev('a', 2, false, 'p')])).toBeNull()
  })

  it('같은 답이 2회 이상이어야 하고, 많이 낸 것을 고른다', () => {
    const r = repeatedWrong([
      ev('a', 1, false, 'p'),
      ev('a', 2, false, 'q'),
      ev('a', 3, false, 'q'),
      ev('a', 4, false, 'q'),
      ev('a', 5, false, 'p'),
    ])
    expect(r).toMatchObject({ wrong: 'q', count: 3, firstAt: 2 })
  })

  it('같은 답이 없으면 null, 동수면 먼저 나온 것', () => {
    expect(repeatedWrong([ev('a', 1, false, 'p'), ev('a', 2, false, 'q'), ev('a', 3, false, 'r')])).toBeNull()
    const r = repeatedWrong([
      ev('a', 1, false, 'p'),
      ev('a', 2, false, 'q'),
      ev('a', 3, false, 'q'),
      ev('a', 4, false, 'p'),
    ].concat([ev('a', 5, false, 'z')]))
    expect(r).toMatchObject({ wrong: 'p', count: 2, firstAt: 1 })
  })

  it('공백 답은 굳은 오답이 아니다', () => {
    const h = [ev('a', 1, false, ''), ev('a', 2, false, ''), ev('a', 3, false, '  '), ev('a', 4, false, 'p')]
    expect(repeatedWrong(h)).toBeNull()
  })

  it('가타카나 답은 히라가나로 모으고, mistakeType 은 최빈 비-null 값', () => {
    const r = repeatedWrong([
      ev('a', 1, false, 'スナコ', null),
      ev('a', 2, false, 'すなこ', 'RENDAKU'),
      ev('a', 3, false, 'すなこ', 'RENDAKU'),
    ])
    expect(r).toMatchObject({ wrong: 'すなこ', count: 3, mistakeType: 'RENDAKU' })
  })
})

describe('mulberry32 / sample', () => {
  it('같은 시드면 같은 표본', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    expect(sample(items, 5, mulberry32(7))).toEqual(sample(items, 5, mulberry32(7)))
    expect(sample(items, 5, mulberry32(7))).not.toEqual(sample(items, 5, mulberry32(8)))
  })

  it('원본을 바꾸지 않고 모자라면 있는 만큼만', () => {
    const items = [1, 2, 3]
    expect(sample(items, 5, mulberry32(1))).toHaveLength(3)
    expect(items).toEqual([1, 2, 3])
  })
})

describe('analyze', () => {
  const kanji: Record<string, KanjiReadings> = {
    砂: { onyomi: ['サ', 'シャ'], kunyomi: ['すな'] },
    店: { onyomi: ['テン'], kunyomi: ['みせ', 'たな'] },
    子: { onyomi: ['シ', 'ス'], kunyomi: ['こ'] },
    供: { onyomi: ['キョウ', 'ク'], kunyomi: ['とも', 'そな.える'] },
  }
  const lookup = (k: string): KanjiReadings | undefined => kanji[k]
  const idioms: DictIdiom[] = [
    { id: 'sunako', headword: '砂子', reading: 'すなご' },
    { id: 'tanako', headword: '店子', reading: 'たなこ' },
    { id: 'kodomo', headword: '子供', reading: 'こども' },
  ]
  const wrongs = (id: string, from: number, answer: string): ReviewEvent[] => [
    ev(id, from, false, answer),
    ev(id, from + 1, false, answer),
    ev(id, from + 2, false, answer),
  ]

  it('砂子·店子 를 서로 거꾸로 붙이면 각자 R2 이고 서로 거꾸로 짝이 된다', () => {
    const r = analyze(
      [ev('tanako', 1, true), ev('sunako', 2, true), ...wrongs('sunako', 10, 'すなこ'), ...wrongs('tanako', 20, 'たなご')],
      idioms,
      lookup,
    )
    expect(r.chronic).toBe(2)
    const byHead = Object.fromEntries(r.cases.map((c) => [c.headword, [c.align.ok && c.align.wrong, c.cls]]))
    expect(byHead).toEqual({ 砂子: ['こ', 'R2'], 店子: ['ご', 'R2'] })
    expect(r.mutual.strict).toEqual([{ a: 'sunako', b: 'tanako', kanji: '子' }])
    expect(r.mutual.dict).toHaveLength(1)
  })

  it('출처를 오답이 처음 나온 뒤에야 만났다면 학습한 출처로 치지 않는다 (미래 정보 금지)', () => {
    // 砂子 의 오답은 t=10 에 처음 나오는데 店子 는 t=20 에야 처음 풀린다
    const r = analyze([...wrongs('sunako', 10, 'すなこ'), ...wrongs('tanako', 20, 'たなご')], idioms, lookup)
    const sunako = r.cases.find((c) => c.idiomId === 'sunako')!
    const tanako = r.cases.find((c) => c.idiomId === 'tanako')!
    expect(sunako.srcLearned).toEqual([])
    expect([...sunako.srcDict].sort()).toEqual(['kodomo', 'tanako'])
    expect(sunako.cls).toBe('R3') // 학습한 출처가 없으니 R3(탁음 차이뿐)로 떨어진다
    expect(tanako.srcLearned).toEqual(['sunako'])
    expect(r.mutual.strict).toEqual([])
    expect(r.mutual.dict).toHaveLength(1)
  })

  it('동음 혼동은 R1 이 R2 보다 앞선다', () => {
    const more: DictIdiom[] = [...idioms, { id: 'other', headword: '子供', reading: 'こども' }]
    // 砂子 의 굳은 오답이 다른 표현(子供)의 읽기와 같은 경우
    const r = analyze(
      [ev('kodomo', 1, true), ...wrongs('sunako', 10, 'こども')],
      more,
      lookup,
    )
    const c = r.cases[0]!
    expect(c.homoLearned).toEqual(['kodomo'])
    expect([...c.homoDict].sort()).toEqual(['kodomo', 'other'])
    expect(c.cls).toBe('R1')
  })

  it('R4 는 기록의 mistakeType, 공백 답은 대상에서 빠진다', () => {
    const ko = [
      ev('tanako', 1, false, 'てんし', 'KO_INTERFERENCE'),
      ev('tanako', 2, false, 'てんし', 'KO_INTERFERENCE'),
      ev('tanako', 3, false, 'てんし', 'KO_INTERFERENCE'),
    ]
    const blank = [ev('sunako', 1, false, ''), ev('sunako', 2, false, ''), ev('sunako', 3, false, '')]
    const r = analyze([...ko, ...blank], idioms, lookup)
    expect(r.chronic).toBe(2)
    expect(r.repeatedWithEmpty).toBe(2)
    expect(r.cases).toHaveLength(1)
    expect(r.cases[0]).toMatchObject({ idiomId: 'tanako', ko: true, cls: 'R4' })
  })

  it('사전에 없는 표현은 대상에서 빠지고 세어 둔다', () => {
    const r = analyze(wrongs('ghost', 1, 'あ'), idioms, lookup)
    expect(r.cases).toEqual([])
    expect(r.skipped.noDict).toBe(1)
  })
})
