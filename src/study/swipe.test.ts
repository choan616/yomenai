// 스와이프 방향 판정 검증 (사용자 요청 2026-09-12)
import { describe, expect, it } from 'vitest'
import { swipeDirection, SWIPE_MIN_X } from './swipe.ts'

describe('swipeDirection', () => {
  it('왼쪽으로 충분히 밀면 다음', () => {
    expect(swipeDirection(-SWIPE_MIN_X, 0)).toBe('next')
    expect(swipeDirection(-200, 10)).toBe('next')
  })

  it('오른쪽으로 충분히 밀면 이전', () => {
    expect(swipeDirection(SWIPE_MIN_X, 0)).toBe('prev')
    expect(swipeDirection(200, -10)).toBe('prev')
  })

  it('가로 이동이 모자라면 넘기지 않는다 (탭·미세한 흔들림)', () => {
    expect(swipeDirection(0, 0)).toBe(null)
    expect(swipeDirection(SWIPE_MIN_X - 1, 0)).toBe(null)
    expect(swipeDirection(-30, 5)).toBe(null)
  })

  it('세로가 더 크면 넘기지 않는다 — 카드 안을 스크롤하려던 손이다', () => {
    expect(swipeDirection(80, 120)).toBe(null)
    expect(swipeDirection(-80, -120)).toBe(null)
  })

  it('가로·세로가 같으면 넘기지 않는다 (대각선은 스크롤 쪽에 준다)', () => {
    expect(swipeDirection(100, 100)).toBe(null)
    expect(swipeDirection(-100, 100)).toBe(null)
  })
})
