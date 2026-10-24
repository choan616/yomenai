// 환기 퀴즈 문항 생성(동음이의 표기 고르기)을 검증한다
import { describe, expect, it } from 'vitest'
import { buildHomophoneIndex, homophoneQuestion, pickQuizQuestions, type QuizIdiom } from './quiz.ts'

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
      expect(q.options.find((o) => o.idiomId === 'a1')!.meaning).toBe('구성')
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
    expect(qs.map((q) => q.reading)).toEqual(['こうせい', 'いし'])
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

  it('고정 난수로 결정적이다', () => {
    const ids = ['a1', 'c1', 'e1']
    expect(pickQuizQuestions(ids, index, 2, rng(11))).toEqual(pickQuizQuestions(ids, index, 2, rng(11)))
  })
})
