// 가중 무작위 추출 — 재대결 세션과 훑어보기가 같이 쓴다 (2026-09-11 재대결, 2026-09-12 훑어보기)

/**
 * 가중치를 두고 중복 없이 `k` 개를 뽑는다.
 * 가중치가 큰 항목이 더 자주·앞쪽에 나오되 매번 조합과 순서가 달라진다.
 *
 * 호출부는 뽑기 전에 `pool` 을 안정된 기준(id 등)으로 세워야 한다 — Map 순회 순서
 * (= 기기 간 이벤트 병합 순서)에 결과가 휘둘리지 않게 하는 장치다.
 */
export function pickWeighted<T>(
  pool: { item: T; weight: number }[],
  k: number,
  rand: () => number,
): T[] {
  const rest = [...pool]
  let total = rest.reduce((sum, c) => sum + c.weight, 0)
  const picked: T[] = []
  while (picked.length < k && rest.length > 0) {
    let r = rand() * total
    let i = 0
    while (i < rest.length - 1 && r >= rest[i].weight) {
      r -= rest[i].weight
      i++
    }
    picked.push(rest[i].item)
    total -= rest[i].weight
    rest.splice(i, 1)
  }
  return picked
}
