// (한자, 음독) 쌍의 숙달 현황을 파생시킨다 — 진도 지표가 아니라 진단 도구다 (PLAN §6/§7 "음독 맵")
import type { OnyomiPair } from '../dict/load.ts'
import type { ReplayState } from './replay.ts'

/** 숙달로 보는 최소 노출 수와 허용 오답률. 단순하게 유지한다 (PLAN §7) */
export const MASTERY_MIN_SEEN = 3
export const MASTERY_MAX_WRONG_RATE = 0.2

export type PairStatus = 'mastered' | 'learning' | 'unseen'

export interface PairRow {
  pairId: string
  kanji: string
  base: string
  kind: 'on' | 'kun'
  seen: number
  wrong: number
  status: PairStatus
}

export interface OnyomiMasterySummary {
  total: number
  mastered: number
  learning: number
  unseen: number
}

function statusOf(seen: number, wrong: number): PairStatus {
  if (seen === 0) return 'unseen'
  if (seen >= MASTERY_MIN_SEEN && wrong / seen <= MASTERY_MAX_WRONG_RATE) return 'mastered'
  return 'learning'
}

const STATUS_ORDER: Record<PairStatus, number> = { learning: 0, unseen: 1, mastered: 2 }

/**
 * 학습 대상 pairId 집합에 대해 쌍별 숙달 상태를 만든다.
 * 분모는 pairs 사전 전체가 아니라 실제 카드에 등장하는 쌍(base 풀이 참조하는 것)이다.
 * 정렬 — 학습 중(오답률 높은 순) → 미학습 → 숙달.
 */
export function pairRows(
  learnPairIds: Iterable<string>,
  pairs: Map<string, OnyomiPair>,
  state: ReplayState,
): PairRow[] {
  const rows: PairRow[] = []
  for (const pid of new Set(learnPairIds)) {
    const p = pairs.get(pid)
    if (p === undefined) continue
    const stat = state.onyomi.get(pid)
    const seen = stat?.seen ?? 0
    const wrong = stat?.wrong ?? 0
    rows.push({ pairId: pid, kanji: p.kanji, base: p.base, kind: p.kind, seen, wrong, status: statusOf(seen, wrong) })
  }
  rows.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
    if (s !== 0) return s
    const r = (b.wrong / (b.seen || 1)) - (a.wrong / (a.seen || 1))
    if (r !== 0) return r
    return a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0
  })
  return rows
}

export function summarize(rows: PairRow[]): OnyomiMasterySummary {
  const out: OnyomiMasterySummary = { total: rows.length, mastered: 0, learning: 0, unseen: 0 }
  for (const r of rows) out[r.status]++
  return out
}
