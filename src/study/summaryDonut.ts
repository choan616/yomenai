// 세션 요약의 도넛 — 카드를 푼 순서대로 정답·오답 호를 잇고, 가운데 배지의 색을 정한다
// (2026-10-05 디자인 시안, 2026-10-06 사용자 「정오 순서를 기억해서 도넛 색을 노출」 · 「가운데 원은 오답이 많으면 빨강, 정답이 많으면 파랑」)

/** 구분선의 두께(px) */
export const DONUT_SEP = 2

/** 카드가 이 수를 넘으면 카드마다 긋지 않는다 — 선이 빽빽해 도넛이 줄무늬로 보인다. 이때는 같은 결과가 이어진 구간으로 묶는다 */
export const DONUT_MAX_SEGMENTS = 30

export interface DonutArc {
  /** 12시 방향에서 시계 방향으로 잰 시작 위치 */
  from: number
  len: number
  ok: boolean
}

/**
 * `results` 는 푼 순서대로의 정오(true = 정답). 원둘레 `circ` 를 카드 수만큼 똑같이 나눠 순서대로 칠한다 —
 * 정·오·정·오 로 풀었으면 호도 그 순서로 번갈아 선다. 구분선 `seps` 는 호의 경계에 놓인다.
 * 카드가 `DONUT_MAX_SEGMENTS` 를 넘으면 같은 결과가 이어진 구간을 한 호로 묶고, 결과가 바뀌는 곳에만 긋는다
 */
export function donutSegments(results: boolean[], circ: number): { arcs: DonutArc[]; seps: number[] } {
  const n = results.length
  if (n === 0) return { arcs: [], seps: [] }
  const unit = circ / n
  if (n <= DONUT_MAX_SEGMENTS) {
    return {
      arcs: results.map((ok, i) => ({ from: i * unit, len: unit, ok })),
      seps: results.map((_, i) => i * unit),
    }
  }
  const arcs: DonutArc[] = []
  for (const [i, ok] of results.entries()) {
    const last = arcs[arcs.length - 1]
    if (last && last.ok === ok) last.len += unit
    else arcs.push({ from: i * unit, len: unit, ok })
  }
  return { arcs, seps: arcs.length > 1 ? arcs.map((a) => a.from) : [] }
}

/** 가운데 배지의 색 — 오답이 정답보다 많으면 `miss`(빨강), 아니면 `ok`(강조색). 같으면 정답 쪽이다 */
export function sealTone(results: boolean[]): 'ok' | 'miss' {
  const right = results.filter(Boolean).length
  return results.length - right > right ? 'miss' : 'ok'
}
