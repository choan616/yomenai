// 사전 DB(읽기 전용 정적 자산)를 런타임에 불러온다. 사용자 DB(IndexedDB)와 절대 섞지 않는다 (CLAUDE.md)
import type { Band } from '../lib/bands.ts'
import type { ClassSource, IdiomEntry } from '../core/session.ts'
import type { KoreanCategory } from '../core/types.ts'

/** `public/dict/{base,band4}.json` 의 레코드 원형. 빌드: `tools/build-runtime-dict.ts` */
interface RawIdiom {
  id: string
  headword: string
  reading: string
  pos: string[]
  band: Band
  common: boolean
  category: KoreanCategory | null
  classSource: ClassSource | null
  koMeaning: KoMeaning | null
  pairIds: string[]
  readingKind: ReadingKind
  /** 같은 표기의 다른 읽기 (동형이독). 겹치는 표기가 없으면 필드 자체가 없다 */
  altReadings?: string[]
  /** 조회 전용 — 읽기를 한자 단위로 못 가른다 (2026-09-26). `lookup.json` 에만 있다 */
  lookupOnly?: boolean
}

/**
 * 숙어를 읽는 법의 갈래. 빌드가 구성 쌍에서 정한다 (`tools/build-runtime-dict.ts`).
 * `kun` 은 음독 쌍이 하나도 없는 숙어다 — 浜辺(はまべ)·荒木(あらき).
 */
export type ReadingKind = 'on' | 'mix' | 'kun'

/**
 * 출제 범위. 훈독 숙어는 **한국 한자음으로 유추할 근거가 없고** 음독 맵·형제 대조·
 * 「음독을 잘못 골랐다」 오답 분류가 전부 안 붙어서 기본으로 뺀다.
 * 설정의 `kunPercent` 가 0 보다 크면 들어온다 (2026-09-22).
 *
 * **몇 장 나올지는 여기서 안 정한다** — 그건 `selectSession` 의 `kunShare` 정원이 정한다.
 * 이 함수는 후보에 들어가느냐만 가른다.
 *
 * 혼독(重箱·湯桶読み)은 **언제나 남긴다** — 음독 쌍이 있으니 위 장치가 그대로 걸리고,
 * 오히려 읽기가 갈리는 자리라 핵심에 가깝다.
 *
 * 풀을 만드는 모든 자리(세션·홈 미리보기·진입 진단·밴드 사다리)가 이 함수를 쓴다.
 * 범위가 한 군데서만 정해져야 「공부는 했는데 사다리엔 없는 것」이 안 생긴다.
 */
export function studyPool<T extends { readingKind: ReadingKind }>(
  idioms: readonly T[],
  includeKun: boolean,
): T[] {
  return includeKun ? [...idioms] : idioms.filter((i) => i.readingKind !== 'kun')
}

export interface KoMeaning {
  /** 화면에 뜨는 한국어 뜻. 지금은 JMdict 영어 gloss 를 옮긴 것 (source 'llm'), 검수되면 'manual' */
  definition: string
  /** 번역 원본이 된 영어 gloss (오답 상세·검수 대조용). stdict 폴백 경로에는 없다 */
  glossEn?: string[]
  source: 'stdict' | 'llm' | 'manual'
  verified: boolean
}

/**
 * 런타임 숙어. `buildSession` 이 요구하는 `IdiomEntry` 를 그대로 포함하고 화면용 필드를 더한다.
 * 밴드 4 는 한국어 대조를 안 돌렸으므로 category/classSource 가 비어 오는데,
 * 확장(2) · default 로 채운다 — 모드 배정 1단계 기본값과 같다.
 */
export interface RuntimeIdiom extends IdiomEntry {
  headword: string
  /** 같은 표기의 다른 읽기. 읽기 채점이 이것도 정답으로 받는다 (2026-09-14) */
  altReadings?: string[]
  reading: string
  pos: string[]
  common: boolean
  koMeaning: KoMeaning | null
  readingKind: ReadingKind
  /**
   * 조회 전용 (2026-09-26). 읽기를 한자 단위로 못 가르는 숙어(熟字訓·当て字)다 —
   * `昨日(きのう)`·`今日(きょう)`. 음독 맵도 형제 대조도 오답 분류도 안 붙어 세션에
   * 못 들어가므로 화면이 담기를 안 낸다. `lookup.json` 에만 실리고 학습 풀은 그 파일을
   * 안 읽으므로 세션·음독맵·리포트에는 애초에 안 닿는다
   */
  lookupOnly?: boolean
}

export interface OnyomiPair {
  kanji: string
  base: string
  kind: 'on' | 'kun'
}

export interface KanjiInfo {
  /** 한국 한자음 — 지금 쓰는 음 (KANJIDIC2 korean_h, override 있으면 그 now) */
  kr: string[]
  /** 옛·드문 음 — 자전엔 있으나 현대 어휘에 안 쓰이는 음. override 없으면 빈 배열 */
  krOld: string[]
  on: string[]
  kun: string[]
}

/** 원형 레코드를 런타임 숙어로. 밴드 4 의 빈 분류를 확장 기본값으로 채운다 */
export function normalizeIdiom(r: RawIdiom): RuntimeIdiom {
  return {
    idiomId: r.id,
    band: r.band,
    category: r.category ?? 2,
    classSource: r.classSource ?? 'default',
    pairIds: r.pairIds,
    headword: r.headword,
    reading: r.reading,
    pos: r.pos,
    common: r.common,
    koMeaning: r.koMeaning,
    // 뜻이 없으면 뜻 카드를 낼 수 없다 — 밴드 4 는 아직 번역을 안 돌렸다 (2026-09-23)
    hasMeaning: (r.koMeaning?.definition ?? '').trim() !== '',
    readingKind: r.readingKind,
    altReadings: r.altReadings,
    ...(r.lookupOnly ? { lookupOnly: true } : {}),
  }
}

async function fetchDict<T>(name: string): Promise<T> {
  const url = `${import.meta.env.BASE_URL}dict/${name}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`사전 자산 로드 실패: ${url} (${res.status})`)
  return (await res.json()) as T
}

let basePromise: Promise<RuntimeIdiom[]> | null = null
let band4Promise: Promise<RuntimeIdiom[]> | null = null
let lookupPromise: Promise<RuntimeIdiom[]> | null = null
let pairsPromise: Promise<Map<string, OnyomiPair>> | null = null
let kanjiPromise: Promise<Map<string, KanjiInfo>> | null = null
let examplesPromise: Promise<Map<string, string[]>> | null = null

/** 밴드 0~3 기본 번들. 첫 호출에서 fetch 하고 이후 캐시된 Promise 를 준다 */
export function loadBaseIdioms(): Promise<RuntimeIdiom[]> {
  basePromise ??= fetchDict<{ idioms: RawIdiom[] }>('base.json').then((d) =>
    d.idioms.map(normalizeIdiom),
  )
  return basePromise
}

/**
 * 조회 전용 번들 (2026-09-26 사용자 지적 「昨日도 없는 것은 수상하다」).
 *
 * 읽기를 한자 단위로 못 가르는 숙어(熟字訓·当て字)다 — `昨日(きのう)`·`今日(きょう)`·
 * `二人(ふたり)`. 학습 장치가 하나도 안 붙어 세션에는 못 내지만, 소설을 읽으면 반드시
 * 만나는 말이라 **찾기에서는 나와야 한다.**
 *
 * 914KB 라 기본 번들과 같이 프리캐시한다 — 밴드 4(20MB)·넓힌 사전(3.4MB)과 달리
 * 물어볼 만한 무게가 아니고, 첫 실행부터 오프라인으로 찾아져야 한다
 */
export function loadLookupIdioms(): Promise<RuntimeIdiom[]> {
  lookupPromise ??= fetchDict<{ idioms: RawIdiom[] }>('lookup.json').then((d) =>
    d.idioms.map(normalizeIdiom),
  )
  return lookupPromise
}

/** 밴드 4 (선택). 설정에서 켤 때만 부른다 */
export function loadBand4Idioms(): Promise<RuntimeIdiom[]> {
  band4Promise ??= fetchDict<{ idioms: RawIdiom[] }>('band4.json').then((d) =>
    d.idioms.map(normalizeIdiom),
  )
  return band4Promise
}

/** (한자, 음독) 쌍 사전 — 음독 맵 화면 */
export function loadPairs(): Promise<Map<string, OnyomiPair>> {
  pairsPromise ??= fetchDict<{ pairs: Record<string, OnyomiPair> }>('pairs.json').then(
    (d) => new Map(Object.entries(d.pairs)),
  )
  return pairsPromise
}

/** 런타임 등장 한자의 한국 한자음·음훈독 — 오답 상세 화면 */
export function loadKanji(): Promise<Map<string, KanjiInfo>> {
  kanjiPromise ??= fetchDict<{ kanji: Record<string, KanjiInfo> }>('kanji.json').then(
    (d) => new Map(Object.entries(d.kanji)),
  )
  return kanjiPromise
}

/**
 * Tatoeba 무번역 예문 — 확인 단계 참고용 (Phase 6). 세션 시작을 막지 않게 첫 필요
 * 시점(읽기 피드백 렌더)에서만 fetch 한다. `data/dict/examples.json` 을 안 만들었으면
 * 산출물 자체가 없어 fetch 가 실패하는데, 그 경우 조용히 빈 맵으로 — 기능이 없을 뿐이다
 */
export function loadExamples(): Promise<Map<string, string[]>> {
  examplesPromise ??= fetchDict<{ byId: Record<string, string[]> }>('examples.json')
    .then((d) => new Map(Object.entries(d.byId)))
    .catch(() => new Map<string, string[]>())
  return examplesPromise
}
