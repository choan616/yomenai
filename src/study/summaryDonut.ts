// 세션 요약의 도넛 — 맞은 호의 길이와 카드 사이의 구분선 위치를 정한다
// (2026-10-05 디자인 시안, 사용자 「도넛 그래프처럼」 · 「구분선을 살짝」 · 「연달아 맞은 것도 카드 수만큼 구분이 되면 좋겠다」)

/** 구분선의 두께(px) */
export const DONUT_SEP = 2

/** 카드가 이 수를 넘으면 카드마다 긋지 않는다 — 선이 빽빽해 도넛이 줄무늬로 보인다. 이때는 맞음/틀림 경계에만 긋는다 */
export const DONUT_MAX_SEGMENTS = 30

/**
 * 원둘레 `circ` 위에 놓을 호 길이와 구분선 위치. 맞은 호가 12시에서 시작하고 틀린 호가 그 뒤를 잇는다. 두 호는 틈 없이 맞닿는다.
 * `seps` 는 구분선을 놓을 호 위치다 — 카드 한 장이 한 칸이 되도록 `circ / total` 간격으로 긋는다(연달아 맞은 것도 장수가 읽힌다).
 * 카드가 `DONUT_MAX_SEGMENTS` 를 넘으면 맞음/틀림 경계(시작점과 맞은 호의 끝점)에만 긋고, 한쪽만 있으면 긋지 않는다
 */
export function donutArcs(correct: number, total: number, circ: number): { right: number; wrong: number; seps: number[] } {
  if (total <= 0) return { right: 0, wrong: 0, seps: [] }
  const wrongCount = Math.max(0, total - correct)
  const right = wrongCount === 0 ? circ : correct <= 0 ? 0 : (correct / total) * circ
  const wrong = circ - right
  if (total <= DONUT_MAX_SEGMENTS) {
    return { right, wrong, seps: Array.from({ length: total }, (_, i) => (i * circ) / total) }
  }
  const mixed = right > 0 && wrong > 0
  return { right, wrong, seps: mixed ? [0, right] : [] }
}
