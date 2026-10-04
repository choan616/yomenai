// 기능 잠금 — 레벨 제도가 없는 지금은 모두 잠겨 있다
import { describe, expect, it } from 'vitest'
import { isUnlocked } from './unlocks.ts'

describe('isUnlocked', () => {
  it('끝말잇기는 기본으로 잠겨 있다', () => {
    expect(isUnlocked('shiritori')).toBe(false)
  })
})
