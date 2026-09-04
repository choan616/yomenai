// 사전 번들을 (한자, 음독) 쌍 → 숙어 목록으로 역인덱스한다 — 오답 상세의 "같은 음독 다른 숙어"
import { loadBaseIdioms, type RuntimeIdiom } from './load.ts'

/** base 풀 전체를 pairId 로 역인덱스한다. 값은 등장 순서(사전 DB 정렬) 그대로다 */
export function buildPairIndex(pool: RuntimeIdiom[]): Map<string, RuntimeIdiom[]> {
  const idx = new Map<string, RuntimeIdiom[]>()
  for (const it of pool) {
    for (const pid of it.pairIds) {
      let list = idx.get(pid)
      if (list === undefined) idx.set(pid, (list = []))
      list.push(it)
    }
  }
  return idx
}

let indexPromise: Promise<Map<string, RuntimeIdiom[]>> | null = null

/** 밴드 0~3 풀의 pairId 역인덱스. 첫 호출에서 만들고 이후 캐시된 Promise 를 준다 */
export function loadPairIndex(): Promise<Map<string, RuntimeIdiom[]>> {
  indexPromise ??= loadBaseIdioms().then(buildPairIndex)
  return indexPromise
}
