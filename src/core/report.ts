// 진단 리포트의 파생 로직 — 오답 유형 분포, 취약 음독, 한국음 간섭 패턴 (PLAN §7 "이 앱의 얼굴")
import type { OnyomiPair } from '../dict/load.ts'
import { mistakeTotals, type ReplayState } from './replay.ts'
import type { MistakeType } from './types.ts'

/** 취약 음독으로 올리는 최소 노출 수 */
export const WEAK_MIN_SEEN = 3
/** 리포트에 싣는 취약 음독·간섭 숙어 상한 */
export const TOP_N = 8

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

export interface Report {
  /** 읽기 카드 채점 횟수 (reps 합) */
  totalReviews: number
  totalMistakes: number
  /** count 가 0 이 아닌 유형만, 많은 순 */
  mistakes: MistakeSlice[]
  weakOnyomi: WeakOnyomi[]
  koInterferenceCount: number
  koInterferenceIdioms: NamedIdiom[]
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
  const koIdioms: NamedIdiom[] = []
  for (const c of state.cards.values()) {
    if (c.cardType !== 'reading') continue
    totalReviews += c.card.reps
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
    totalMistakes,
    mistakes,
    weakOnyomi,
    koInterferenceCount: totals.KO_INTERFERENCE ?? 0,
    koInterferenceIdioms: koIdioms.slice(0, TOP_N),
  }
}
