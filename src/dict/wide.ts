// 학습 사전 **밖** 표제어를 찾을 때만 받는다 (2026-09-25, 사용자 제안)
//
// `readingIndex.ts` 의 `loadBand4ReadingIndex` 와 헷갈리면 안 된다. 저쪽은 학습 사전
// **안**에서 출제 범위를 밴드 4까지 넓힌 것이고, 이쪽은 상용한자 밖 글자가 섞여
// 임포트가 버렸던 것들이다 (`tools/build-wide-dict.ts`).
//
// **학습 대상이 아니다.** 밴드·음독 쌍·분류가 없어 세션에 못 들어간다 — 읽기 분해가
// 없으면 채점도 오답 분류도 안 붙는다 (Phase 2 의 설계된 거부). 그래서 담기를 안 연다.
//
// 받는 것이 셋이다. 사전 2.2MB, 전용 폰트 두 벌 1.4MB, `@font-face` 선언 39KB.
// 폰트를 같이 붙이지 않으면 `轟` 이 시스템 폰트로 떨어져 **한국 자형**이 뜰 수 있다
// (한중일 통합, CLAUDE.md). 선언만 붙여 두면 woff2 는 그 글자가 화면에 실제로 뜰 때
// 브라우저가 알아서 받는다 — `unicode-range` 가 그 일을 한다.
import { buildReadingIndex, type ReadingIndex } from './readingIndex.ts'
import type { KanjiInfo } from './load.ts'

/** 조회 전용 항목. `RuntimeIdiom` 과 달리 밴드·음독 쌍·한국어 뜻이 **없다** */
export interface WideIdiom {
  id: string
  headword: string
  reading: string
  altReadings?: string[]
  pos: string[]
  glossEn: string[]
}

export interface WideDict {
  index: ReadingIndex<WideIdiom>
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
      kanji: new Map(Object.entries(data.kanji)),
      count: data.idioms.length,
    }
  })().catch((e: unknown) => {
    promise = null
    throw e
  })
  return promise
}
