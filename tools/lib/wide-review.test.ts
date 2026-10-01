// 사전 밖 표현 검수 판정 접기 검증 — o·x·애매·취소, 학습 사전 id 제외, 덮어쓰기 규칙
import { describe, expect, it } from 'vitest'
import { foldWideReview, type WideReview } from './wide-review.ts'

const draft = new Map([
  ['w1', '산화아연 연고'],
  ['w2', '바보, 어리석음'],
  ['w3', '불확실함'],
])
const classIds = new Set(['c1'])

describe('foldWideReview', () => {
  it('o 는 초안 뜻 그대로 검증 완료(llm), x+fix 는 고친 뜻(manual)이다', () => {
    const { next, stats } = foldWideReview(
      [
        { id: 'w1', verdict: 'o', fix: '' },
        { id: 'w2', verdict: 'x', fix: '멍청이' },
      ],
      draft,
      classIds,
      {},
    )
    expect(next.w1).toEqual({ definition: '산화아연 연고', source: 'llm', verified: true })
    expect(next.w2).toEqual({ definition: '멍청이', source: 'manual', verified: true })
    expect(stats).toMatchObject({ added: 2, kept: 0, overwritten: 0 })
  })

  it('애매(~)·취소(-)·빈 칸·고친 뜻 없는 x 는 안 건드린다', () => {
    const { next, stats } = foldWideReview(
      [
        { id: 'w1', verdict: '~', fix: '메모' },
        { id: 'w2', verdict: '-', fix: '' },
        { id: 'w3', verdict: '', fix: '' },
        { id: 'w1', verdict: 'x', fix: '   ' },
      ],
      draft,
      classIds,
      {},
    )
    expect(next).toEqual({})
    expect(stats.untouched).toBe(4)
  })

  it('학습 사전 id 와 어디에도 없는 id 는 여기서 안 다룬다', () => {
    const { next, stats } = foldWideReview(
      [
        { id: 'c1', verdict: 'o', fix: '' },
        { id: 'zz', verdict: 'o', fix: '' },
      ],
      draft,
      classIds,
      {},
    )
    expect(next).toEqual({})
    expect(stats).toMatchObject({ classOwned: 1, unknown: 1 })
  })

  it('기본은 이미 기록된 항목을 안 덮는다 — force 면 값이 다른 것만 덮고 같은 값은 그대로다', () => {
    const prev: WideReview = {
      w1: { definition: '산화아연 연고', source: 'llm', verified: true },
      w2: { definition: '멍청이', source: 'manual', verified: true },
    }
    const rows = [
      { id: 'w1', verdict: 'x', fix: '아연화 연고' },
      { id: 'w2', verdict: 'x', fix: '멍청이' },
    ]
    const keep = foldWideReview(rows, draft, classIds, prev)
    expect(keep.next).toEqual(prev)
    expect(keep.stats).toMatchObject({ kept: 2, overwritten: 0 })

    const forced = foldWideReview(rows, draft, classIds, prev, true)
    expect(forced.next.w1).toEqual({ definition: '아연화 연고', source: 'manual', verified: true })
    expect(forced.next.w2).toEqual(prev.w2)
    expect(forced.stats).toMatchObject({ kept: 1, overwritten: 1 })
    expect(forced.stats.changes).toEqual([{ id: 'w1', from: '산화아연 연고', to: '아연화 연고' }])
  })

  it('o 는 이미 고친 뜻을 지킨다 — 멱등이다', () => {
    const prev: WideReview = { w2: { definition: '멍청이', source: 'manual', verified: true } }
    const once = foldWideReview([{ id: 'w2', verdict: 'o', fix: '' }], draft, classIds, prev)
    expect(once.next.w2).toEqual(prev.w2)
    const twice = foldWideReview([{ id: 'w2', verdict: 'o', fix: '' }], draft, classIds, once.next, true)
    expect(twice.next).toEqual(once.next)
    expect(twice.stats.overwritten).toBe(0)
  })
})
