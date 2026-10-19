// 정답·오답 화면에서 Enter 로 「다음」을 누르게 하는 훅 (PC 물리 키보드용)
import { useEffect, useRef } from 'react'

/**
 * `enabled` 인 동안 Enter 가 `onNext` 를 부른다. 포커스가 어디 있든 같다 — 입력창은 피드백 중
 * locked 라 Enter 를 삼키고, 「자세히」를 눌러 포커스가 버튼으로 옮겨 가 있어도 Enter 는 다음이다
 * (자세히는 클릭으로만 연다). 포커스가 버튼에 있을 때 Enter 가 그 버튼의 클릭이 되지 않게
 * preventDefault 한다.
 *
 * 꾹 누름(`repeat`)은 무시한다 — 제출한 Enter 를 누른 채로 있으면 정답 화면이 지나가 버린다.
 * IME 조합 중 Enter 는 변환 확정이라 건드리지 않는다
 */
export function useEnterForNext(enabled: boolean, onNext: () => void): void {
  const nextRef = useRef(onNext)
  useEffect(() => {
    nextRef.current = onNext
  })

  useEffect(() => {
    if (!enabled) return
    // 답을 제출한 바로 그 Enter 가 이 리스너까지 올라와 곧장 다음으로 넘기지 않게 한다 —
    // 제출 렌더의 effect 가 같은 키 이벤트 전파 중에 등록될 수 있다. 등록 전에 생긴 이벤트는 버린다
    const since = performance.now()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.isComposing || e.repeat || e.timeStamp <= since) return
      e.preventDefault()
      nextRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])
}
