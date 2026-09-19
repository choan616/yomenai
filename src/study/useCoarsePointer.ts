// 손가락으로 쓰는 기기인지. 로마자 자판을 띄울지와 시스템 키보드를 막을지를 **한 조건으로** 묶는다.
//
// 둘이 갈리면 함정이 생긴다 — 자판은 CSS 로 숨겼는데 `inputMode="none"` 은 걸려 있으면
// 시스템 키보드도 자판도 없어 아무것도 못 친다 (마우스와 터치가 같이 있는 기기).
// 그래서 CSS 미디어 쿼리가 아니라 이 값 하나로 양쪽을 정한다.
import { useSyncExternalStore } from 'react'

const QUERY = '(hover: none) and (pointer: coarse)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function snapshot(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(QUERY).matches
}

/** 서버/테스트 기본값은 false — PC 취급이라 시스템 키보드를 막지 않는다 */
export function useCoarsePointer(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
