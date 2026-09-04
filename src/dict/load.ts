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
}

export interface KoMeaning {
  word: string
  origin: string
  definition: string
  source: string
  verified: boolean
}

/**
 * 런타임 숙어. `buildSession` 이 요구하는 `IdiomEntry` 를 그대로 포함하고 화면용 필드를 더한다.
 * 밴드 4 는 한국어 대조를 안 돌렸으므로 category/classSource 가 비어 오는데,
 * 확장(2) · default 로 채운다 — 모드 배정 1단계 기본값과 같다.
 */
export interface RuntimeIdiom extends IdiomEntry {
  headword: string
  reading: string
  pos: string[]
  common: boolean
  koMeaning: KoMeaning | null
}

export interface OnyomiPair {
  kanji: string
  base: string
  kind: 'on' | 'kun'
}

export interface KanjiInfo {
  /** 한국 한자음 (KANJIDIC2 korean_h) */
  kr: string[]
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
let pairsPromise: Promise<Map<string, OnyomiPair>> | null = null
let kanjiPromise: Promise<Map<string, KanjiInfo>> | null = null

/** 밴드 0~3 기본 번들. 첫 호출에서 fetch 하고 이후 캐시된 Promise 를 준다 */
export function loadBaseIdioms(): Promise<RuntimeIdiom[]> {
  basePromise ??= fetchDict<{ idioms: RawIdiom[] }>('base.json').then((d) =>
    d.idioms.map(normalizeIdiom),
  )
  return basePromise
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
