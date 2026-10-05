// 세션 요약의 도넛 — 맞은 호와 틀린 호의 길이를 정한다 (2026-10-05 디자인 시안, 사용자 「도넛 그래프처럼」)

/** 두 호가 맞닿는 두 곳의 틈(px). 둘 다 있을 때만 낸다 */
export const DONUT_GAP = 3

/**
 * 원둘레 `circ` 위에 놓을 호 길이. 맞은 호가 앞이고 틀린 호가 그 뒤를 잇는다.
 * 둘 다 있으면 맞닿는 두 곳(맞음→틀림, 틀림→맞음)에 틈을 낸다. 한쪽만 있으면 한 바퀴 전부다
 */
export function donutArcs(correct: number, total: number, circ: number): { right: number; wrong: number } {
  if (total <= 0) return { right: 0, wrong: 0 }
  const wrongCount = Math.max(0, total - correct)
  if (wrongCount === 0) return { right: circ, wrong: 0 }
  if (correct <= 0) return { right: 0, wrong: circ }
  const right = (correct / total) * circ - DONUT_GAP
  const wrong = (wrongCount / total) * circ - DONUT_GAP
  return { right: Math.max(0, right), wrong: Math.max(0, wrong) }
}
