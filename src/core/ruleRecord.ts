// 규칙 절에 붙는 "내가 이 규칙으로 틀린 기록" 을 파생시킨다 (2026-09-17).
// 규칙 화면을 읽을거리가 아니라 색인으로 만드는 부분이다 — 해설만 있는 문서는 다시 안 열린다.
// replay 파생만 쓴다. 새 이벤트도, 새 저장도 없다.
import type { NamedIdiom } from './report.ts'
import type { ReplayState } from './replay.ts'
import type { MistakeType } from './types.ts'

/** 한 절에 싣는 숙어 상한. 목록이 아니라 표본이라 짧게 둔다 */
export const RULE_RECORD_TOP = 8

export interface RuleRecordIdiom extends NamedIdiom {
  /** 그 절의 유형들로 이 숙어에서 틀린 횟수 */
  wrong: number
}

export interface RuleRecord {
  /** 그 절의 유형들로 틀린 총 횟수 */
  count: number
  /** 많이 틀린 순. 동점이면 id 순으로 고정한다 (같은 기록이면 같은 화면) */
  idioms: RuleRecordIdiom[]
}

/**
 * 한 절이 다루는 오답 유형들로 틀린 기록을 모은다.
 *
 * 분류에 실패한 오답(`CardState.wrong` 만 오른 것)은 안 잡힌다 — 유형을 모르면 어느 절에
 * 넣을지도 모르기 때문이다. 리포트의 `unclassified` 가 그 몫을 따로 드러낸다.
 */
export function ruleRecord(
  state: ReplayState,
  types: readonly MistakeType[],
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
  limit: number = RULE_RECORD_TOP,
): RuleRecord {
  let count = 0
  const rows: RuleRecordIdiom[] = []
  for (const c of state.cards.values()) {
    let wrong = 0
    for (const t of types) wrong += c.mistakes[t] ?? 0
    if (wrong === 0) continue
    count += wrong
    const n = nameOf(c.idiomId)
    if (n) rows.push({ id: c.idiomId, headword: n.headword, reading: n.reading, wrong })
  }
  rows.sort((a, b) => b.wrong - a.wrong || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { count, idioms: rows.slice(0, limit) }
}
