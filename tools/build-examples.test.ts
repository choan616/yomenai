// pickExamples 단위 테스트 — 길이 상한 필터 + 짧은 순 정렬 + 중복 제거
import { describe, expect, it } from 'vitest'
import { pickExamples } from './build-examples.ts'

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
