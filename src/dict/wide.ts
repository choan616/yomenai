// 학습 사전 **밖** 표제어를 찾을 때만 받는다 (2026-09-25, 사용자 제안)
//
// `readingIndex.ts` 의 `loadBand4ReadingIndex` 와 헷갈리면 안 된다. 저쪽은 학습 사전
// **안**에서 출제 범위를 밴드 4까지 넓힌 것이고, 이쪽은 상용한자 밖 글자가 섞여
// 임포트가 버렸던 것들이다 (`tools/build-wide-dict.ts`).
//
// **기본은 조회 전용이다.** 밴드·음독 쌍·분류가 없어 그대로는 세션에 못 들어간다.
// 다만 **사람이 담은 것만** 학습 사전으로 올린다 (`adopt`, 2026-09-25) — 15,114개를
// 통째로 들이면 진단 기준이 달라지지만, 내가 한 칸씩 넓히는 것은 그렇지 않다.
//
// 받는 것이 셋이다. 사전 2.2MB, 전용 폰트 두 벌 1.4MB, `@font-face` 선언 39KB.
// 폰트를 같이 붙이지 않으면 `轟` 이 시스템 폰트로 떨어져 **한국 자형**이 뜰 수 있다
// (한중일 통합, CLAUDE.md). 선언만 붙여 두면 woff2 는 그 글자가 화면에 실제로 뜰 때
// 브라우저가 알아서 받는다 — `unicode-range` 가 그 일을 한다.
import { decompose, pairId, type KanjiReadings } from '../lib/onyomi.ts'
import { buildReadingIndex, type ReadingIndex } from './readingIndex.ts'
import type { KanjiInfo, RuntimeIdiom } from './load.ts'

/** 조회 전용 항목. `RuntimeIdiom` 과 달리 밴드·음독 쌍·한국어 뜻이 **없다** */
export interface WideIdiom {
  id: string
  headword: string
  reading: string
  altReadings?: string[]
  pos: string[]
  glossEn: string[]
  /**
   * 한국어 뜻 (2026-09-26). 영어 gloss 를 옮긴 LLM 초벌이라 `verified` 는 늘 false 다 —
   * 학습 사전의 뜻과 같은 출처·같은 수준이다. 번역 전 빌드에는 필드가 없다
   */
  koMeaning?: { definition: string; source: 'llm'; verified: false }
}

export interface WideDict {
  index: ReadingIndex<WideIdiom>
  /** id → 항목. 담은 것을 되짚어 학습 사전으로 올릴 때 쓴다 (`adopt`) */
  byId: Map<string, WideIdiom>
  /** 넓힌 사전에만 나오는 한자의 한국음·음훈독. 런타임 `kanji.json` 에는 없는 글자들이다 */
  kanji: Map<string, KanjiInfo>
  count: number
}

/** `@font-face` 선언은 한 번만 붙인다 */
let fontsLinked = false
function linkWideFonts(): void {
  if (fontsLinked || typeof document === 'undefined') return
  fontsLinked = true
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `${import.meta.env.BASE_URL}fonts/wide.css`
  document.head.append(link)
}

let promise: Promise<WideDict> | null = null

/** 첫 호출에서 받고 이후 캐시된 Promise 를 준다. 실패하면 다시 시도할 수 있게 비운다 */
export function loadWideDict(): Promise<WideDict> {
  promise ??= (async () => {
    linkWideFonts()
    const res = await fetch(`${import.meta.env.BASE_URL}dict/wide.json`)
    if (!res.ok) throw new Error(`wide.json ${res.status}`)
    const data = (await res.json()) as {
      idioms: WideIdiom[]
      kanji: Record<string, KanjiInfo>
    }
    return {
      index: buildReadingIndex(data.idioms),
      byId: new Map(data.idioms.map((it) => [it.id, it])),
      kanji: new Map(Object.entries(data.kanji)),
      count: data.idioms.length,
    }
  })().catch((e: unknown) => {
    promise = null
    throw e
  })
  return promise
}

/**
 * 넓힌 사전 항목을 **학습 사전으로 들인다** (2026-09-25 사용자 제안).
 *
 * 15,114개를 통째로 들이면 음독 쌍이 2,532 → 4,794 로 늘고 그 절반이 상용 밖 글자가 된다.
 * 그러면 「숙지한 음독」이 재는 것이 달라진다 — 낮은 점수가 「상용한자를 모른다」가 아니라
 * 「표외자를 모른다」가 된다 (실측 2026-09-25). 그래서 **사람이 담은 것만** 올린다.
 * 분모는 내가 넓힌 만큼만 는다.
 *
 * **사전을 재빌드하지 않는다.** 읽기 분해와 음독 쌍을 여기서 그 자리에 계산한다 —
 * `surface.ts` 가 이미 런타임에 하는 일이다.
 *
 * **못 들이는 것이 있다.** 가르는 기준은 상용한자가 아니라 **읽기를 한자 단위로 가를 수
 * 있느냐**다. 못 가르면 음독 맵·형제 대조·오답 분류가 하나도 안 붙어서 들여도 학습이
 * 안 된다. 실측 — 들일 수 있는 것 9,915(음독 8,095 · 혼독 1,820),
 * 못 들이는 것 5,199(훈독만 2,560 · 분해 실패 2,639).
 */
export function adopt(
  it: WideIdiom,
  lookup: (kanji: string) => KanjiReadings | undefined,
): RuntimeIdiom | null {
  const d = decompose(it.headword, it.reading, lookup)
  if (!d.ok) return null
  const kinds = new Set(d.segments.map((s) => s.kind))
  if (!kinds.has('on')) return null

  return {
    idiomId: it.id,
    // 빈도 순위가 없는 것이 사실이다. 밴드 4 는 「담은 것만 들어온다」는 규칙이 이미 걸려 있다
    band: 4,
    // 한국어 분류를 안 돌렸다. 어차피 뜻이 없어 `assignMode` 가 교정 모드로 고정한다
    category: 2,
    classSource: 'default',
    pairIds: d.segments
      .filter((s) => s.kind === 'on')
      .map((s) => pairId(s.kanji, s.base, 'on')),
    headword: it.headword,
    reading: it.reading,
    ...(it.altReadings ? { altReadings: it.altReadings } : {}),
    pos: it.pos,
    common: false,
    // 뜻이 있으면 확장 모드(뜻 카드)로도 갈 수 있다. 없으면 `assignMode` 가 교정으로 고정한다
    koMeaning: it.koMeaning ?? null,
    hasMeaning: (it.koMeaning?.definition ?? '').trim() !== '',
    readingKind: kinds.has('kun') ? 'mix' : 'on',
  }
}

/**
 * 런타임 `kanji.json` 은 학습 사전에 나오는 2,130자뿐이라 `轟` 이 없다.
 * 합쳐 두지 않으면 세션 안에서 **후리가나와 오답 분류가 조용히 안 붙는다** —
 * `mistakeContextFromKanji` 의 lookup 과 형제 색인이 둘 다 이 Map 을 본다.
 */
export function withWideKanji(
  base: Map<string, KanjiInfo>,
  wide: WideDict | null,
): Map<string, KanjiInfo> {
  if (wide === null || wide.kanji.size === 0) return base
  return new Map([...base, ...wide.kanji])
}
