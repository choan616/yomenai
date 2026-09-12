// 진단 리포트의 파생 로직 — 오답 유형 분포, 취약 음독, 한국음 간섭 패턴 (PLAN §7 "이 앱의 얼굴")
import type { OnyomiPair } from '../dict/load.ts'
import { pickWeighted } from './pick.ts'
import { mistakeTotals, type ReplayState } from './replay.ts'
import type { MistakeType } from './types.ts'

/** 취약 음독으로 올리는 최소 노출 수 */
export const WEAK_MIN_SEEN = 3
/** 리포트에 싣는 취약 음독·간섭 숙어 상한 */
export const TOP_N = 8
/** 훑어보기에 싣는 숙어 상한. 읽는 목록이라 출제 목록보다 길게 둔다 (12 → 30, 사용자 요청) */
export const BROWSE_N = 30

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
  /** 훑어보기 후보 전량. 화면에 몇 장 낼지는 `pickBrowse` 가 정한다 */
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
 * 훑어보기 **후보 전량** — 한 번이라도 틀린 읽기 카드.
 * 리포트와 훑어보기 화면이 같은 기준을 쓰도록 여기 둔다. 실제로 낼 장수는 `pickBrowse`.
 *
 * 틀린 적 없는 카드는 안 담는다 (사용자 결정 2026-09-12). 넘길 카드를 늘리는 건
 * `BROWSE_N` 상한으로 하지, 기준을 흐려서 하지 않는다 — "틀린 것을 다시 본다" 가
 * 이 화면의 정체다. 다만 재대결(`buildRematch`)과 달리 극복한 카드(`streak`)는
 * 안 뺀다. 출제가 아니라 노출이라 최근에 맞혔어도 다시 읽고 듣는 게 복습이다
 * (context-notes 2026-09-12 절).
 *
 * **뽑기 전 입력 순서를 id 로 고정한다** — Map 순회 순서(= 기기 간 이벤트 병합 순서)에
 * `pickBrowse` 결과가 휘둘리지 않게 하는 장치다 (`buildRematch` 와 같은 관례).
 */
export function frequentIdioms(
  state: ReplayState,
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
): FrequentIdiom[] {
  const rows: FrequentIdiom[] = []
  for (const c of state.cards.values()) {
    if (c.cardType !== 'reading' || c.wrong <= 0) continue
    const n = nameOf(c.idiomId)
    if (n) rows.push({ id: c.idiomId, headword: n.headword, reading: n.reading, wrong: c.wrong })
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rows
}

/**
 * 훑어볼 카드를 **오답 수 가중 무작위**로 뽑는다 (사용자 요청 2026-09-12 "섞여서 노출").
 *
 * 오답 수로 결정적으로 정렬해 앞에서 자르면 들어갈 때마다 같은 카드가 같은 순서로 나온다 —
 * 재대결이 같은 이유로 가중 무작위로 바뀌었다 (2026-09-11). 자주 틀린 것이 더 자주·앞쪽에
 * 나오되 조합과 순서가 매번 달라진다.
 */
export function pickBrowse(
  rows: FrequentIdiom[],
  limit = BROWSE_N,
  rand: () => number = Math.random,
): FrequentIdiom[] {
  return pickWeighted(
    rows.map((row) => ({ item: row, weight: row.wrong })),
    limit,
    rand,
  )
}
