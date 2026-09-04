// 읽기 오답 상세의 순수 뷰모델 — 음독 분해, 한국 한자음 대조, 같은 음독을 쓰는 다른 숙어 (PLAN §7)
import type { KanjiInfo, OnyomiPair, RuntimeIdiom } from '../dict/load.ts'

export interface BreakdownPart {
  pairId: string
  kanji: string
  /** 이 숙어에서 이 한자가 쓴 음/훈독 (히라가나 대표형) */
  base: string
  kind: 'on' | 'kun'
  /** 한국 한자음 (KANJIDIC2 korean_h) */
  kr: string[]
}

/** 숙어의 pairIds 를 (한자, 음독) 조각으로 펼치고 각 한자의 한국 한자음을 병기한다 */
export function breakdown(
  idiom: Pick<RuntimeIdiom, 'pairIds'>,
  pairs: Map<string, OnyomiPair>,
  kanji: Map<string, KanjiInfo>,
): BreakdownPart[] {
  const out: BreakdownPart[] = []
  for (const pid of idiom.pairIds) {
    const p = pairs.get(pid)
    if (p === undefined) continue
    out.push({ pairId: pid, kanji: p.kanji, base: p.base, kind: p.kind, kr: kanji.get(p.kanji)?.kr ?? [] })
  }
  return out
}

export interface SharedIdiom {
  id: string
  headword: string
  reading: string
}

/** 같은 (한자, 음독) 쌍을 쓰는 다른 숙어 몇 개. 자기 자신은 제외한다 */
export function sharedIdioms(
  pairId: string,
  index: Map<string, RuntimeIdiom[]>,
  excludeId: string,
  limit = 5,
): SharedIdiom[] {
  const out: SharedIdiom[] = []
  for (const it of index.get(pairId) ?? []) {
    if (it.idiomId === excludeId) continue
    out.push({ id: it.idiomId, headword: it.headword, reading: it.reading })
    if (out.length >= limit) break
  }
  return out
}
