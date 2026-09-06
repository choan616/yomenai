// 정답 직후 카드 아래에 스치는 음독 메아리 — 방금 쓴 음독을 지금까지 몇 번 만났는지.
// 낱개 암기가 아니라 그물이 조여지는 감각을 주는 자리다. 탭이 필요 없고 다음 카드에서 사라진다
import { parsePairId } from '../lib/onyomi.ts'
import type { OnyomiStat } from './types.ts'
import type { LearningEvent } from './types.ts'

export interface OnyomiEcho {
  kanji: string
  base: string
  kind: 'on' | 'kun'
  /** 이 음독을 만난 횟수 (방금 이 카드 포함) */
  nth: number
}

export interface EchoInput {
  /** 방금 맞힌 숙어의 (한자, 음독) 쌍 */
  pairIds: string[]
  /** 세션 시작 시점의 음독 집계 */
  before: Map<string, OnyomiStat>
  /** 이번 세션에서 이미 기록한 이벤트 */
  sessionEvents: LearningEvent[]
  pairsOf: (idiomId: string) => string[]
}

/**
 * 세션 시작 시점 집계에 이번 세션에서 쌓인 만큼을 더해 "몇 번째"를 만든다.
 * 전체 로그를 다시 재생하지 않는다 — 카드 전환 예산이 150ms 라 재생을 끼울 수 없다.
 */
export function onyomiEcho(input: EchoInput): OnyomiEcho[] {
  const inSession = new Map<string, number>()
  for (const e of input.sessionEvents) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    for (const p of input.pairsOf(e.idiomId)) inSession.set(p, (inSession.get(p) ?? 0) + 1)
  }

  const out: OnyomiEcho[] = []
  const seen = new Set<string>()
  for (const id of input.pairIds) {
    // 같은 숙어에 같은 쌍이 두 번 들어가면(々 전개 등) 한 번만 보여준다
    if (seen.has(id)) continue
    seen.add(id)
    const p = parsePairId(id)
    if (p === null) continue
    const prior = (input.before.get(id)?.seen ?? 0) + (inSession.get(id) ?? 0)
    out.push({ kanji: p.kanji, base: p.base, kind: p.kind, nth: prior + 1 })
  }
  return out
}
