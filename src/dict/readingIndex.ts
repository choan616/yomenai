// 사전 번들을 읽기(가나) → 숙어 목록으로 역인덱스한다 — 「읽기로 찾기」 검색 화면
//
// `pairIndex.ts` 와 같은 모양이되 축이 다르다. 저쪽 키는 `光:on:こう` 쌍이라 光栄·光線 이
// 묶이고("이 한자가 이 음을 갖는 다른 예"), 이쪽 키는 단어 전체 읽기라 光輝·好機 처럼
// 한자가 하나도 안 겹치는 것이 묶인다("이 소리로 읽히는 다른 단어").
import { toHiragana } from '../lib/readings.ts'
import { loadBand4Idioms, loadBaseIdioms, loadLookupIdioms, type RuntimeIdiom } from './load.ts'

/** 찾기에 필요한 최소 모양. 넓힌 사전 항목은 밴드·음독 쌍이 없어 RuntimeIdiom 이 아니다 */
export interface Indexable {
  headword: string
  reading: string
  altReadings?: string[]
}

export interface ReadingIndex<T extends Indexable = RuntimeIdiom> {
  /** 읽기 → 그 읽기를 가진 숙어. 값은 등장 순서(사전 DB 정렬) 그대로 */
  byReading: Map<string, T[]>
  /** 앞부분 일치 구간을 이진 탐색으로 자르기 위한 정렬된 키 배열 */
  keys: string[]
  /**
   * 표기 → 그 표기를 가진 숙어 (2026-09-24). 같은 한자를 달리 읽는 항목이 있어 값이 배열이다
   * (`生物` せいぶつ·なまもの).
   *
   * **읽기와 같은 Map 에 안 넣는다.** 결과를 읽기로 묶어 보여 주는 화면이라
   * 한자가 묶음 제목 자리에 들어가면 그게 읽기처럼 보인다
   */
  byHeadword: Map<string, T[]>
  /** 표기 쪽 앞부분 일치용 정렬 키 */
  headKeys: string[]
}

/** 같은 읽기로 묶인 결과 한 덩이 */
export interface ReadingGroup<T extends Indexable = RuntimeIdiom> {
  reading: string
  items: T[]
  /** 쿼리와 정확히 같은 읽기인가. 앞부분 일치와 화면에서 구분한다 */
  exact: boolean
}

/**
 * base 풀 전체를 읽기로 역인덱스한다.
 *
 * **`altReadings` 도 키로 넣는다** — 御前 을 `おんまえ` 로 찾으면 나와야 한다.
 * 한 숙어가 여러 키에 걸리므로 값 배열에 중복 등장하지 않게 키별로만 담는다.
 */
export function buildReadingIndex<T extends Indexable>(pool: T[]): ReadingIndex<T> {
  const byReading = new Map<string, T[]>()
  const put = (reading: string, it: T) => {
    const key = toHiragana(reading)
    if (key === '') return
    let list = byReading.get(key)
    if (list === undefined) byReading.set(key, (list = []))
    if (!list.includes(it)) list.push(it)
  }
  const byHeadword = new Map<string, T[]>()
  for (const it of pool) {
    put(it.reading, it)
    for (const alt of it.altReadings ?? []) put(alt, it)
    let heads = byHeadword.get(it.headword)
    if (heads === undefined) byHeadword.set(it.headword, (heads = []))
    heads.push(it)
  }
  return {
    byReading,
    keys: [...byReading.keys()].sort(),
    byHeadword,
    headKeys: [...byHeadword.keys()].sort(),
  }
}

/** 한자가 섞였나 — 섞였으면 읽기가 아니라 표기로 찾는다 (々 는 표기에만 쓴다) */
export function looksLikeHeadword(query: string): boolean {
  return /[一-鿿㐀-䶿々]/u.test(query)
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
export function searchByReading<T extends Indexable>(
  index: ReadingIndex<T>,
  query: string,
  limit = 20,
): ReadingGroup<T>[] {
  const q = toHiragana(query.trim())
  if (q === '') return []

  const out: ReadingGroup<T>[] = []
  for (let i = lowerBound(index.keys, q); i < index.keys.length; i++) {
    const key = index.keys[i]!
    if (!key.startsWith(q)) break
    out.push({ reading: key, items: index.byReading.get(key) ?? [], exact: key === q })
    if (out.length >= limit) break
  }
  // lowerBound 가 사전순으로 잡아 주므로 정확 일치는 이미 맨 앞이다. 정렬을 더 하지 않는다
  return out
}

/**
 * 표기로 찾는다 (2026-09-24 사용자 요청 「한자를 직접 붙여넣어도 검색이 되는지」).
 *
 * 책에서 본 한자를 그대로 가져올 때 쓴다 — 읽는 법을 모르니까 찾는 것인데, 지금까지는
 * 읽기를 알아야만 찾을 수 있었다. 카메라가 대신하던 길을 손으로도 열어 둔다.
 *
 * **결과는 읽기로 묶어 돌려준다.** 화면이 읽기 묶음을 그리게 돼 있고, 한자로 찾았어도
 * 정작 알고 싶은 것은 읽기라 묶음 제목이 답이 된다.
 */
export function searchByHeadword<T extends Indexable>(
  index: ReadingIndex<T>,
  query: string,
  limit = 20,
): ReadingGroup<T>[] {
  const q = query.trim()
  if (q === '') return []

  const groups: ReadingGroup<T>[] = []
  const byKey = new Map<string, ReadingGroup<T>>()
  // 정렬 키를 앞부분으로 자르므로 정확 일치 표기가 늘 먼저 온다 — 읽기 쪽과 같은 수법이다
  for (let i = lowerBound(index.headKeys, q); i < index.headKeys.length; i++) {
    const key = index.headKeys[i]!
    if (!key.startsWith(q)) break
    for (const it of index.byHeadword.get(key) ?? []) {
      const reading = toHiragana(it.reading)
      let group = byKey.get(reading)
      if (group === undefined) {
        if (groups.length >= limit) return groups
        group = { reading, items: [], exact: key === q }
        byKey.set(reading, group)
        groups.push(group)
      }
      group.items.push(it)
    }
  }
  return groups
}

let indexPromise: Promise<ReadingIndex> | null = null

/** 밴드 0~3 풀의 읽기 역인덱스. 첫 호출에서 만들고 이후 캐시된 Promise 를 준다 */
export function loadReadingIndex(): Promise<ReadingIndex> {
  // 조회 전용도 **기본 색인에 같이 넣는다** — 昨日·今日 이 안 나오는 것이 이상하다
  // (2026-09-26). 담기는 화면이 막는다 (`lookupOnly`)
  indexPromise ??= Promise.all([loadBaseIdioms(), loadLookupIdioms()]).then(([base, lookup]) =>
    buildReadingIndex([...base, ...lookup]),
  )
  return indexPromise
}

let band4Promise: Promise<ReadingIndex> | null = null

/**
 * 밴드 4까지 넣은 역인덱스 (2026-09-23 사용자 판정).
 *
 * **`wide.ts` 의 「넓힌 사전」과 다르다.** 저쪽은 학습 사전 **밖**(상용한자 밖 글자)이고,
 * 이쪽은 학습 사전 **안**에서 출제 범위만 밴드 4까지 넓힌 것이다
 *
 * **찾기는 학습이 아니라 조회다.** 출제 범위(밴드 0~3)와 찾을 수 있는 범위가 같아야 할
 * 이유가 없다. 소설에서 막히는 말일수록 빈도표 밖이라 — `陰鬱`·`憂鬱` 이 밴드 4다.
 * 카메라를 붙이면서 더 그렇다. 모르는 말이라서 찍는 것이니까.
 *
 * **20MB 다.** 그래서 찾기를 열 때가 아니라 **실제로 찾기 시작할 때** 부른다
 * (`Search.tsx`). 한 번 받으면 서비스워커 런타임 캐시에 남는다.
 */
export function loadBand4ReadingIndex(): Promise<ReadingIndex> {
  band4Promise ??= Promise.all([loadBaseIdioms(), loadBand4Idioms(), loadLookupIdioms()]).then(
    ([base, band4, lookup]) => buildReadingIndex([...base, ...band4, ...lookup]),
  )
  return band4Promise
}
