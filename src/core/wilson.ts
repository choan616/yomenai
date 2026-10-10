// 비율의 Wilson 95% 구간 — 표본이 작을 때 그 값이 어디까지 흔들릴 수 있는지 (수준 판정·진단 소견이 같이 쓴다)

/** `correct`/`n` 의 Wilson 95% 구간(0~1). 표본이 없으면 전체 구간 */
export function wilson(correct: number, n: number): [number, number] {
  if (n === 0) return [0, 1]
  const z = 1.96
  const p = correct / n
  const denom = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denom
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom
  return [Math.max(0, center - half), Math.min(1, center + half)]
}
