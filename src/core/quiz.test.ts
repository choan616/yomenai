// 환기 퀴즈 문항 생성(읽기가 같거나 비슷한 표기 고르기)을 검증한다
import { describe, expect, it } from 'vitest'
import {
  buildHomophoneIndex,
  homophoneQuestion,
  pickQuizQuestions,
  readingQuestion,
  type QuizIdiom,
} from './quiz.ts'

/** mulberry32 — select.ts 와 같은 계열의 재현 가능한 난수 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function idiom(id: string, headword: string, reading: string, definition: string | null): QuizIdiom {
  return {
    idiomId: id,
    headword,
    reading,
    koMeaning: definition === null ? null : { definition, source: 'llm', verified: false },
  }
}

const KOUSEI = [
  idiom('a1', '構成', 'こうせい', '구성'),
  idiom('a2', '公正', 'こうせい', '공정'),
  idiom('a3', '厚生', 'こうせい', '후생, 복지'),
  idiom('a4', '更生', 'こうせい', '갱생'),
  idiom('a5', '恒星', 'こうせい', '항성'),
]

describe('homophoneQuestion', () => {
  it('보기가 모두 같은 읽기의 서로 다른 표기이고 정답을 포함한다', () => {
    const pool = [...KOUSEI, idiom('b1', '意思', 'いし', '의사')]
    const index = buildHomophoneIndex(pool)
    for (let seed = 1; seed <= 20; seed++) {
      const q = homophoneQuestion(pool[0]!, index, rng(seed))!
      expect(q).not.toBeNull()
      expect(q.options.length).toBeGreaterThanOrEqual(3)
      expect(q.options.length).toBeLessThanOrEqual(4)
      const heads = q.options.map((o) => o.headword)
      expect(new Set(heads).size).toBe(heads.length)
      const readingOf = new Map(pool.map((p) => [p.idiomId, p.reading]))
      for (const o of q.options) expect(readingOf.get(o.idiomId)).toBe('こうせい')
      expect(q.options.map((o) => o.idiomId)).toContain('a1')
      expect(q.targetId).toBe('a1')
      expect(q.reading).toBe('こうせい')
      expect(q.meaning).toBe('구성')
    }
  })

  it('뜻이 같은 보기와 빈 뜻 보기는 쓰지 않는다', () => {
    const pool = [
      idiom('t', '異常', 'いじょう', '이상, 비정상'),
      idiom('d1', '異状', 'いじょう', '이상, 비정상'), // 같은 뜻
      idiom('d2', '以上', 'いじょう', '이상, 그 이상'), // 갈래 '이상' 이 겹침
      idiom('d3', '移譲', 'いじょう', '이양, 양도'),
      idiom('d4', '委譲', 'いじょう', null), // 뜻 없음
      idiom('d5', '井上', 'いじょう', '   '), // 공백뿐
      idiom('d6', '偉丈', 'いじょう', '당당함'),
      idiom('d7', '威仗', 'いじょう', '이양'), // d3 와 갈래 겹침 — 둘 중 하나만
    ]
    const index = buildHomophoneIndex(pool)
    for (let seed = 1; seed <= 30; seed++) {
      const q = homophoneQuestion(pool[0]!, index, rng(seed))!
      const ids = q.options.map((o) => o.idiomId)
      for (const bad of ['d1', 'd2', 'd4', 'd5']) expect(ids).not.toContain(bad)
      expect(ids.includes('d3') && ids.includes('d7')).toBe(false)
    }
  })

  it('정답에 뜻이 없으면 null', () => {
    const pool = [idiom('t', '構成', 'こうせい', null), ...KOUSEI.slice(1)]
    expect(homophoneQuestion(pool[0]!, buildHomophoneIndex(pool), rng(1))).toBeNull()
  })

  it('뜻으로 갈리는 보기가 2개 미만이면 null', () => {
    const pool = [
      idiom('t', '異常', 'いじょう', '이상'),
      idiom('d1', '異状', 'いじょう', '이상'), // 겹침
      idiom('d2', '移譲', 'いじょう', '이양'), // 쓸 수 있는 건 이것 하나
    ]
    expect(homophoneQuestion(pool[0]!, buildHomophoneIndex(pool), rng(1))).toBeNull()
  })

  it('같은 읽기 항목이 혼자면 null', () => {
    const pool = [idiom('t', '意思', 'いし', '의사')]
    expect(homophoneQuestion(pool[0]!, buildHomophoneIndex(pool), rng(1))).toBeNull()
  })

  it('exclude 에 든 숙어는 보기에 안 나온다', () => {
    const index = buildHomophoneIndex(KOUSEI)
    const exclude = new Set(['a4'])
    for (let seed = 1; seed <= 20; seed++) {
      const q = homophoneQuestion(KOUSEI[0]!, index, rng(seed), exclude)!
      // 후보 5개 중 a4 를 빼면 정답 포함 4개가 정확히 남는다
      expect(q.options.map((o) => o.idiomId).sort()).toEqual(['a1', 'a2', 'a3', 'a5'])
    }
  })

  it('exclude 로 보기가 2개 미만이 되면 null, 정답이 exclude 에 들어도 null', () => {
    const index = buildHomophoneIndex(KOUSEI)
    expect(homophoneQuestion(KOUSEI[0]!, index, rng(1), new Set(['a2', 'a3', 'a4']))).toBeNull()
    expect(homophoneQuestion(KOUSEI[0]!, index, rng(1), new Set(['a1']))).toBeNull()
  })

  it('exclude 를 안 주거나 비우면 예전과 같다', () => {
    const index = buildHomophoneIndex(KOUSEI)
    expect(homophoneQuestion(KOUSEI[0]!, index, rng(5), new Set())).toEqual(
      homophoneQuestion(KOUSEI[0]!, index, rng(5)),
    )
  })

  it('보기가 4개를 넘지 않는다', () => {
    const index = buildHomophoneIndex(KOUSEI)
    for (let seed = 1; seed <= 20; seed++) {
      expect(homophoneQuestion(KOUSEI[0]!, index, rng(seed))!.options).toHaveLength(4)
    }
  })

  it('같은 표기가 색인에 두 번 들어와도 보기에는 한 번만 나온다', () => {
    const pool = [
      ...KOUSEI.slice(0, 3),
      idiom('dup', '公正', 'こうせい', '공평하고 올바름'), // a2 와 같은 표기
    ]
    const index = buildHomophoneIndex(pool)
    for (let seed = 1; seed <= 20; seed++) {
      const heads = homophoneQuestion(pool[0]!, index, rng(seed))!.options.map((o) => o.headword)
      expect(new Set(heads).size).toBe(heads.length)
    }
  })

  it('고정 난수로 결정적이다', () => {
    const index = buildHomophoneIndex(KOUSEI)
    const a = homophoneQuestion(KOUSEI[0]!, index, rng(7))
    const b = homophoneQuestion(KOUSEI[0]!, index, rng(7))
    expect(a).toEqual(b)
    const orders = new Set(
      Array.from({ length: 30 }, (_, s) =>
        homophoneQuestion(KOUSEI[0]!, index, rng(s + 1))!.options.map((o) => o.idiomId).join(),
      ),
    )
    expect(orders.size).toBeGreaterThan(1) // 난수에 따라 보기가 섞인다
  })

  // 읽기가 비슷한 묶음(탁음·장음·촉음 차이) — nearKey 가 こきょ 로 같다
  const KOKYO = [
    idiom('g0', '工業', 'こうぎょう', '공업'),
    idiom('g1', '公共', 'こうきょう', '공공'),
    idiom('g2', '好況', 'こうきょう', '호황'),
    idiom('g3', '故郷', 'こきょう', '고향'),
    idiom('g4', '五経', 'ごきょう', '오경'),
  ]

  it('같은 읽기로 모자라면 비슷한 읽기 묶음으로 보기를 채운다', () => {
    const index = buildHomophoneIndex(KOKYO)
    for (let seed = 1; seed <= 20; seed++) {
      // 工業 こうぎょう 는 같은 읽기가 혼자다 — 근접 묶음이 없으면 null 이 된다
      const q = homophoneQuestion(KOKYO[0]!, index, rng(seed))
      expect(q).not.toBeNull()
      expect(q!.targetId).toBe('g0')
      expect(q!.reading).toBe('こうぎょう') // 제시 읽기는 정답의 읽기 그대로다
      expect(q!.options).toHaveLength(4)
      expect(q!.options.map((o) => o.idiomId)).toContain('g0')
    }
  })

  it('난수가 두 묶음을 모두 쓴다 — 동음만인 문항과 근접이 섞인 문항이 다 나온다', () => {
    // 構成 こうせい 는 같은 읽기로 이미 보기가 차지만, 근접 묶음에는 こせい·ごせい 가 더 있다
    const pool = [...KOUSEI, idiom('k1', '個性', 'こせい', '개성'), idiom('k2', '悟性', 'ごせい', '오성')]
    const index = buildHomophoneIndex(pool)
    const near = new Set(['k1', 'k2'])
    let onlyExact = 0
    let withNear = 0
    for (let seed = 1; seed <= 40; seed++) {
      const ids = homophoneQuestion(pool[0]!, index, rng(seed))!.options.map((o) => o.idiomId)
      if (ids.some((id) => near.has(id))) withNear++
      else onlyExact++
    }
    expect(onlyExact).toBeGreaterThan(0)
    expect(withNear).toBeGreaterThan(0)
  })

  it('카타카나 읽기도 같은 묶음으로 본다', () => {
    const pool = [
      idiom('t', '構成', 'こうせい', '구성'),
      idiom('d1', '公正', 'コウセイ', '공정'),
      idiom('d2', '厚生', 'こうせい', '후생'),
    ]
    const q = homophoneQuestion(pool[0]!, buildHomophoneIndex(pool), rng(1))!
    expect(q.options).toHaveLength(3)
  })
})

describe('pickQuizQuestions', () => {
  const pool = [
    ...KOUSEI,
    idiom('c1', '意思', 'いし', '의사'),
    idiom('c2', '意志', 'いし', '의지'),
    idiom('c3', '医師', 'いし', '의사(醫師)'),
    idiom('c4', '遺志', 'いし', '유지'),
    idiom('e1', '以上', 'いじょう', '이상'),
    idiom('e2', '異常', 'いじょう', '비정상'),
    idiom('e3', '移譲', 'いじょう', '양도'),
  ]
  const index = buildHomophoneIndex(pool)

  it('같은 읽기 묶음은 두 문항에 겹치지 않는다', () => {
    // 앞의 후보 둘이 같은 묶음 — 두 번째는 건너뛰고 다음 묶음으로 간다
    const qs = pickQuizQuestions(['a1', 'a2', 'c1'], index, 2, rng(3))
    expect(qs.flatMap((q) => (q.kind === 'headword' ? [q.reading] : []))).toEqual(['こうせい', 'いし'])
    expect(qs.map((q) => q.targetId)).toEqual(['a1', 'c1'])
  })

  it('읽기가 비슷한 묶음도 두 문항에 겹치지 않는다', () => {
    // こうせい 와 こせい 는 읽기가 다르지만 보기 무리가 같다 — 둘째는 안 낸다
    const wide = buildHomophoneIndex([...pool, idiom('k1', '個性', 'こせい', '개성')])
    const qs = pickQuizQuestions(['a1', 'k1', 'c1'], wide, 2, rng(3))
    expect(qs.map((q) => q.targetId)).toEqual(['a1', 'c1'])
  })

  it('n 을 넘기지 않고, 만들 수 없는 후보와 모르는 id 는 건너뛴다', () => {
    const qs = pickQuizQuestions(['없는id', 'x', 'a1', 'c1', 'e1'], index, 2, rng(3))
    expect(qs).toHaveLength(2)
    expect(qs.map((q) => q.targetId)).toEqual(['a1', 'c1'])
    expect(pickQuizQuestions(['a1', 'c1', 'e1'], index, 3, rng(3))).toHaveLength(3)
  })

  it('만들 수 있는 묶음이 모자라면 적게 낸다', () => {
    const lone = buildHomophoneIndex([idiom('z', '意思', 'いし', '의사'), ...KOUSEI])
    expect(pickQuizQuestions(['z', 'a1'], lone, 2, rng(1)).map((q) => q.targetId)).toEqual(['a1'])
    expect(pickQuizQuestions([], lone, 2, rng(1))).toEqual([])
  })

  it('exclude 는 정답 후보와 보기 양쪽에 적용된다', () => {
    const qs = pickQuizQuestions(['a1', 'c1', 'e1'], index, 3, rng(3), new Set(['a1', 'c4']))
    expect(qs.map((q) => q.targetId)).toEqual(['c1', 'e1'])
    for (const q of qs) {
      expect(q.options.map((o) => o.idiomId)).not.toContain('a1')
      expect(q.options.map((o) => o.idiomId)).not.toContain('c4')
    }
  })

  it('고정 난수로 결정적이다', () => {
    const ids = ['a1', 'c1', 'e1']
    expect(pickQuizQuestions(ids, index, 2, rng(11))).toEqual(pickQuizQuestions(ids, index, 2, rng(11)))
  })
})

describe('readingQuestion', () => {
  const KOKYO = [
    idiom('g0', '工業', 'こうぎょう', '공업'),
    idiom('g1', '公共', 'こうきょう', '공공'),
    idiom('g2', '好況', 'こうきょう', '호황'),
    idiom('g3', '故郷', 'こきょう', '고향'),
    idiom('g4', '五経', 'ごきょう', '오경'),
  ]

  it('표기를 주고, 읽기가 비슷한 다른 표현의 읽기를 중복 없이 보기로 낸다', () => {
    const index = buildHomophoneIndex(KOKYO)
    for (let seed = 1; seed <= 20; seed++) {
      const q = readingQuestion(KOKYO[3]!, index, rng(seed))!
      expect(q.kind).toBe('reading')
      expect(q.headword).toBe('故郷')
      const readings = q.options.map((o) => o.reading)
      expect(new Set(readings).size).toBe(readings.length)
      expect(q.options.find((o) => o.idiomId === 'g3')!.reading).toBe('こきょう')
    }
  })

  // 같은 표기의 다른 읽기는 정답이다 — 보기에 두면 정답이 둘로 갈린다
  const KOUSHOU = [
    idiom('t1', '交渉', 'こうしょう', '교섭'),
    idiom('t2', '交渉', 'こうじょう', '교섭(가상의 다른 읽기)'),
    idiom('o1', '御所', 'ごしょ', '어소'),
    idiom('o2', '古書', 'こしょ', '고서'),
    idiom('o3', '呼称', 'こしょう', '호칭'),
  ]

  it('같은 표기의 다른 읽기는 보기에 들어가지 않는다', () => {
    const index = buildHomophoneIndex(KOUSHOU)
    for (let seed = 1; seed <= 30; seed++) {
      const readings = readingQuestion(KOUSHOU[0]!, index, rng(seed))!.options.map((o) => o.reading)
      expect(readings).toHaveLength(4)
      expect(readings).not.toContain('こうじょう')
    }
  })

  it('exclude 는 정답 후보와 보기의 읽기에 적용된다', () => {
    const index = buildHomophoneIndex(KOUSHOU)
    expect(readingQuestion(KOUSHOU[0]!, index, rng(1), new Set(['o1', 'o2']))).toBeNull()
    expect(readingQuestion(KOUSHOU[0]!, index, rng(1), new Set(['t1']))).toBeNull()
  })

  it('한자가 없는 표기와, 서로 다른 읽기를 못 채우는 묶음은 null 이다', () => {
    const kana = [idiom('k0', 'きょう', 'きょう', '오늘'), ...KOUSHOU]
    expect(readingQuestion(kana[0]!, buildHomophoneIndex(kana), rng(1))).toBeNull()
    // 읽기가 모두 같은 동음 묶음 — 구별할 읽기가 없다
    expect(readingQuestion(KOUSEI[0]!, buildHomophoneIndex(KOUSEI), rng(1))).toBeNull()
  })
})

describe('pickQuizQuestions — 읽기 고르기', () => {
  const pool = [
    ...KOUSEI,
    idiom('g0', '工業', 'こうぎょう', '공업'),
    idiom('g1', '公共', 'こうきょう', '공공'),
    idiom('g3', '故郷', 'こきょう', '고향'),
    idiom('g4', '五経', 'ごきょう', '오경'),
  ]
  const index = buildHomophoneIndex(pool)

  it('마지막 칸에만 읽기 고르기를 한 문항 낸다', () => {
    expect(pickQuizQuestions(['a1', 'g3'], index, 2, rng(3)).map((q) => q.kind)).toEqual(['headword', 'reading'])
    expect(pickQuizQuestions(['g3', 'a1'], index, 1, rng(3)).map((q) => q.kind)).toEqual(['headword'])
  })

  it('읽기 고르기를 못 세우면 표기 고르기로 채운다', () => {
    expect(pickQuizQuestions(['a1', 'a2'], index, 2, rng(3)).map((q) => q.kind)).toEqual(['headword'])
  })
})
