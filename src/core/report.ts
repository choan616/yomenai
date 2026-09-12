// 진단 리포트의 파생 로직 — 오답 유형 분포, 취약 음독, 한국음 간섭 패턴 (PLAN §7 "이 앱의 얼굴")
import type { OnyomiPair } from '../dict/load.ts'
import { mistakeTotals, type ReplayState } from './replay.ts'
import type { MistakeType } from './types.ts'

/** 취약 음독으로 올리는 최소 노출 수 */
export const WEAK_MIN_SEEN = 3
/** 리포트에 싣는 취약 음독·간섭 숙어 상한 */
export const TOP_N = 8
/** 훑어보기에 싣는 자주 틀린 숙어 상한. 읽는 목록이라 출제 목록보다 길게 둔다 */
export const BROWSE_N = 12

/** 동점 정렬용 고정 순서 (진단 가치 순, src/core/mistakes.ts 우선순위와 같은 계열) */
const MISTAKE_ORDER: MistakeType[] = [
  'KO_INTERFERENCE',
  'MIXED_READING',
  'ONYOMI_CHOICE',
  'RENDAKU',
  'SOKUON',
  'CHOON',
  'OKURIGANA',
]

export interface MistakeSlice {
  type: MistakeType
  count: number
}

export interface WeakOnyomi {
  pairId: string
  kanji: string
  base: string
  kind: 'on' | 'kun'
  seen: number
  wrong: number
  /** wrong / seen */
  rate: number
}

export interface NamedIdiom {
  id: string
  headword: string
  reading: string
}

/** 훑어보기 행 — 채점 없이 읽기·뜻·소리·예문을 다시 보는 대상 */
export interface FrequentIdiom extends NamedIdiom {
  wrong: number
}

export interface Report {
  /** 읽기 카드 채점 횟수 (reps 합) */
  totalReviews: number
  /**
   * 실제 오답 횟수. 정답률의 분모·분자는 이 값으로 계산해야 한다.
   * `totalMistakes` 로 계산하면 분류 실패분이 정답으로 둔갑한다.
   */
  totalWrong: number
  /** 유형이 붙은 오답 횟수. `totalWrong` 이하다 */
  totalMistakes: number
  /**
   * 유형을 못 붙인 오답 횟수 (`totalWrong - totalMistakes`).
   * 숨기지 않고 드러낸다 — 분류기가 실사용에서 얼마나 놓치는지가 그 자체로 진단 정보다.
   */
  unclassified: number
  /** count 가 0 이 아닌 유형만, 많은 순 */
  mistakes: MistakeSlice[]
  weakOnyomi: WeakOnyomi[]
  koInterferenceCount: number
  koInterferenceIdioms: NamedIdiom[]
  /**
   * 자주 틀린 숙어, 오답 수 내림차순. 훑어보기 섹션이 쓴다.
   * 재대결과 달리 **극복한 카드(streak)를 안 뺀다** — 출제가 아니라 노출이라
   * 최근에 맞힌 것도 다시 보는 게 이득이다.
   */
  frequent: FrequentIdiom[]
}

export function buildReport(
  state: ReplayState,
  pairs: Map<string, OnyomiPair>,
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
): Report {
  const totals = mistakeTotals(state)
  const mistakes: MistakeSlice[] = (Object.entries(totals) as [MistakeType, number][])
    .filter(([, n]) => n > 0)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || MISTAKE_ORDER.indexOf(a.type) - MISTAKE_ORDER.indexOf(b.type))
  const totalMistakes = mistakes.reduce((s, m) => s + m.count, 0)

  let totalReviews = 0
  let totalWrong = 0
  const koIdioms: NamedIdiom[] = []
  for (const c of state.cards.values()) {
    if (c.cardType !== 'reading') continue
    totalReviews += c.card.reps
    totalWrong += c.wrong
    if ((c.mistakes.KO_INTERFERENCE ?? 0) > 0) {
      const n = nameOf(c.idiomId)
      if (n) koIdioms.push({ id: c.idiomId, headword: n.headword, reading: n.reading })
    }
  }
  koIdioms.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

  const weakOnyomi: WeakOnyomi[] = [...state.onyomi.values()]
    .filter((s) => s.seen >= WEAK_MIN_SEEN && s.wrong > 0)
    .map((s) => {
      const p = pairs.get(s.pairId)
      return {
        pairId: s.pairId,
        kanji: p?.kanji ?? s.pairId,
        base: p?.base ?? '',
        kind: p?.kind ?? 'on',
        seen: s.seen,
        wrong: s.wrong,
        rate: s.wrong / s.seen,
      }
    })
    .sort((a, b) => b.rate - a.rate || b.wrong - a.wrong || (a.pairId < b.pairId ? -1 : 1))
    .slice(0, TOP_N)

  return {
    totalReviews,
    totalWrong,
    totalMistakes,
    unclassified: Math.max(0, totalWrong - totalMistakes),
    mistakes,
    weakOnyomi,
    koInterferenceCount: totals.KO_INTERFERENCE ?? 0,
    koInterferenceIdioms: koIdioms.slice(0, TOP_N),
    frequent: frequentIdioms(state, nameOf),
  }
}

/**
 * 자주 틀린 숙어, 오답 수 내림차순. 리포트와 훑어보기 화면이 **같은 기준**을 쓰도록 여기 둔다.
 *
 * 재대결(`buildRematch`)과 달리 극복한 카드(`streak`)를 안 뺀다 — 출제가 아니라 노출이라
 * 최근에 맞힌 것도 다시 읽고 듣는 게 복습이다 (context-notes 2026-09-12 절).
 */
export function frequentIdioms(
  state: ReplayState,
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
  limit = BROWSE_N,
): FrequentIdiom[] {
  const rows: FrequentIdiom[] = []
  for (const c of state.cards.values()) {
    if (c.cardType !== 'reading' || c.wrong <= 0) continue
    const n = nameOf(c.idiomId)
    if (n) rows.push({ id: c.idiomId, headword: n.headword, reading: n.reading, wrong: c.wrong })
  }
  // 동점은 id 로 갈라 기기 간 이벤트 병합 순서에 목록이 안 흔들리게 한다
  rows.sort((a, b) => b.wrong - a.wrong || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rows.slice(0, limit)
}
