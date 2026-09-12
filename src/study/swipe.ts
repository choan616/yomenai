// 가로 스와이프 판정 — 훑어보기 카드 넘기기 (사용자 요청 2026-09-12)

/** 넘김으로 치는 최소 가로 이동(px). 손가락이 살짝 흔들린 건 탭으로 남긴다 */
export const SWIPE_MIN_X = 50

/**
 * 손가락이 움직인 거리로 방향을 정한다.
 *
 * 가로 이동이 \`SWIPE_MIN_X\` 이상이고 세로 이동보다 클 때만 넘김이다 — 세로가 더 크면
 * 카드 안(뜻·예문)을 스크롤하려던 손이라 가로로 채가면 안 된다.
 * `prev` 는 오른쪽으로 민 것(← 뒤로), `next` 는 왼쪽으로 민 것이다.
 */
export function swipeDirection(dx: number, dy: number): 'prev' | 'next' | null {
  if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) <= Math.abs(dy)) return null
  return dx > 0 ? 'prev' : 'next'
}
