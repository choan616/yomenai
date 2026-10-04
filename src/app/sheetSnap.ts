// 하단 시트를 끌고 놓았을 때 어디에 멈출지 정하는 순수 함수 — 높이는 px, 속도는 px/ms(위로 끌면 +)

export type Snap = 'close' | 'peek' | 'full'

/** 이 속도보다 빠르면 놓은 위치보다 **방향**을 따른다 */
export const FLICK = 0.5

/**
 * @param height 놓았을 때 시트 높이
 * @param peek   처음 높이
 * @param full   전체 높이
 * @param velocity 놓기 직전 속도. 위로 끌면 양수
 */
export function nextSnap(height: number, peek: number, full: number, velocity: number): Snap {
  if (velocity > FLICK) return 'full'
  if (velocity < -FLICK) return height > peek ? 'peek' : 'close'
  // 처음 높이의 60% 아래로 끌어내렸으면 닫는다
  if (height < peek * 0.6) return 'close'
  return height > (peek + full) / 2 ? 'full' : 'peek'
}
