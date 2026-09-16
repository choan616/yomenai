// 사전 번들을 읽기(가나) → 숙어 목록으로 역인덱스한다 — 「읽기로 찾기」 검색 화면
//
// `pairIndex.ts` 와 같은 모양이되 축이 다르다. 저쪽 키는 `光:on:こう` 쌍이라 光栄·光線 이
// 묶이고("이 한자가 이 음을 갖는 다른 예"), 이쪽 키는 단어 전체 읽기라 光輝·好機 처럼
// 한자가 하나도 안 겹치는 것이 묶인다("이 소리로 읽히는 다른 단어").
import { toHiragana } from '../lib/readings.ts'
import { loadBaseIdioms, type RuntimeIdiom } from './load.ts'

export interface ReadingIndex {
  /** 읽기 → 그 읽기를 가진 숙어. 값은 등장 순서(사전 DB 정렬) 그대로 */
  byReading: Map<string, RuntimeIdiom[]>
  /** 앞부분 일치 구간을 이진 탐색으로 자르기 위한 정렬된 키 배열 */
  keys: string[]
}

/** 같은 읽기로 묶인 결과 한 덩이 */
export interface ReadingGroup {
  reading: string
  items: RuntimeIdiom[]
  /** 쿼리와 정확히 같은 읽기인가. 앞부분 일치와 화면에서 구분한다 */
  exact: boolean
}

/**
 * base 풀 전체를 읽기로 역인덱스한다.
 *
 * **`altReadings` 도 키로 넣는다** — 御前 을 `おんまえ` 로 찾으면 나와야 한다.
 * 한 숙어가 여러 키에 걸리므로 값 배열에 중복 등장하지 않게 키별로만 담는다.
 */
export function buildReadingIndex(pool: RuntimeIdiom[]): ReadingIndex {
  const byReading = new Map<string, RuntimeIdiom[]>()
  const put = (reading: string, it: RuntimeIdiom) => {
    const key = toHiragana(reading)
    if (key === '') return
    let list = byReading.get(key)
    if (list === undefined) byReading.set(key, (list = []))
    if (!list.includes(it)) list.push(it)
  }
  for (const it of pool) {
    put(it.reading, it)
    for (const alt of it.altReadings ?? []) put(alt, it)
  }
  return { byReading, keys: [...byReading.keys()].sort() }
}

/** 정렬된 키 배열에서 `prefix` 로 시작하는 첫 자리 */
function lowerBound(keys: string[], prefix: string): number {
  let lo = 0
  let hi = keys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (keys[mid]! < prefix) lo = mid + 1
    else hi = mid
  }
  return lo
}

/**
 * 읽기로 찾는다. 정확 일치 묶음이 맨 앞, 그다음 앞부분 일치 묶음이 가나 순이다.
 *
 * 빈 쿼리는 빈 결과다 — 전량을 쏟지 않는다. 상한은 묶음 수 기준이고, 정확 일치 묶음은
 * 상한에 밀려 빠지지 않는다(늘 첫 자리라 자동으로 남는다).
 */
export function searchByReading(index: ReadingIndex, query: string, limit = 20): ReadingGroup[] {
  const q = toHiragana(query.trim())
  if (q === '') return []

  const out: ReadingGroup[] = []
  for (let i = lowerBound(index.keys, q); i < index.keys.length; i++) {
    const key = index.keys[i]!
    if (!key.startsWith(q)) break
    out.push({ reading: key, items: index.byReading.get(key) ?? [], exact: key === q })
    if (out.length >= limit) break
  }
  // lowerBound 가 사전순으로 잡아 주므로 정확 일치는 이미 맨 앞이다. 정렬을 더 하지 않는다
  return out
}

let indexPromise: Promise<ReadingIndex> | null = null

/** 밴드 0~3 풀의 읽기 역인덱스. 첫 호출에서 만들고 이후 캐시된 Promise 를 준다 */
export function loadReadingIndex(): Promise<ReadingIndex> {
  indexPromise ??= loadBaseIdioms().then(buildReadingIndex)
  return indexPromise
}
