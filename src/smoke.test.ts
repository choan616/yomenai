// 스캐폴딩 검증용 더미 테스트 — vitest 실행 여부만 확인한다
import { describe, expect, it } from 'vitest'

describe('smoke', () => {
  it('vitest가 동작한다', () => {
    expect(1 + 1).toBe(2)
  })
})
