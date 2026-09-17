// 규칙 절에 붙는 "내가 이 규칙으로 틀린 기록" 을 파생시킨다 (2026-09-17).
//
// 규칙 화면을 읽을거리가 아니라 색인으로 만드는 부분이다 — 해설만 있는 문서는 다시 안 열린다.
// 새 이벤트도, 새 저장도 없다.
//
// 이벤트를 직접 훑는다(`ReplayState` 가 아니라). 연탁·반탁·연성은 한 유형(`RENDAKU`)으로
// 저장되므로 절을 가르려면 **그 이벤트의 답**이 필요한데, replay 가 접고 나면 답이 없다.
// 이벤트에는 `answer`·`expected` 가 남아 있어 갈래를 언제든 다시 매길 수 있다 —
// 지난 기록에도 소급된다 (스키마는 그대로, CLAUDE.md 불변 조건).
import { explainMistake, type MistakeContext, type VoicingKind } from './mistakes.ts'
import type { NamedIdiom } from './report.ts'
import type { LearningEvent, MistakeType, ReviewEvent } from './types.ts'

/** 한 절에 싣는 숙어 상한. 목록이 아니라 표본이라 짧게 둔다 */
export const RULE_RECORD_TOP = 8

export interface RuleRecordIdiom extends NamedIdiom {
  /** 그 절에 해당하는 오답이 이 숙어에서 난 횟수 */
  wrong: number
}

export interface RuleRecord {
  /** 그 절에 해당하는 오답 총 횟수 */
  count: number
  /** 많이 틀린 순. 동점이면 id 순으로 고정한다 (같은 기록이면 같은 화면) */
  idioms: RuleRecordIdiom[]
}

/** 유형이 붙은 읽기 오답만 추린다. 지워진 이벤트와 미분류 오답은 뺀다 */
export function classifiedMistakes(events: readonly LearningEvent[]): ReviewEvent[] {
  return events.filter(
    (e): e is ReviewEvent =>
      e.type === 'review' && e.deletedAt === null && e.cardType === 'reading' && e.mistakeType !== null,
  )
}

/**
 * 절 하나의 기록을 모은다.
 *
 * `match` 가 절의 조건이다 — 유형만 보는 절도 있고, 탁음 갈래까지 보는 절도 있다.
 * 분류에 실패한 오답은 애초에 들어오지 않는다. 유형을 모르면 어느 절에 넣을지도 모른다
 * (리포트의 `unclassified` 가 그 몫을 따로 드러낸다).
 */
export function ruleRecord(
  events: readonly ReviewEvent[],
  match: (e: ReviewEvent) => boolean,
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
  limit: number = RULE_RECORD_TOP,
): RuleRecord {
  let count = 0
  const byIdiom = new Map<string, number>()
  for (const e of events) {
    if (!match(e)) continue
    count++
    byIdiom.set(e.idiomId, (byIdiom.get(e.idiomId) ?? 0) + 1)
  }

  const rows: RuleRecordIdiom[] = []
  for (const [id, wrong] of byIdiom) {
    const n = nameOf(id)
    if (n) rows.push({ id, headword: n.headword, reading: n.reading, wrong })
  }
  rows.sort((a, b) => b.wrong - a.wrong || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return { count, idioms: rows.slice(0, limit) }
}

/**
 * 이벤트마다 탁음 갈래를 **다시 매긴다** (2026-09-17).
 *
 * 이벤트에는 유형만 있고 갈래가 없다 — 대신 답이 남아 있어 계산이 된다.
 * 규칙 화면과 다시보기가 **같은 함수**를 쓴다. 두 곳에서 따로 매기면 배지가 가리키는 절과
 * 규칙 화면이 언젠가 갈라진다.
 *
 * 갈래를 못 가리면 연탁으로 둔다 — 어느 절에도 안 들어가 사라지는 것보다 낫다.
 */
export function voicingByEvent(
  events: readonly ReviewEvent[],
  ctx: MistakeContext,
  headwordOf: (idiomId: string) => string | undefined,
): Map<string, VoicingKind> {
  const out = new Map<string, VoicingKind>()
  for (const e of events) {
    if (e.mistakeType !== 'RENDAKU') continue
    const headword = headwordOf(e.idiomId)
    if (headword === undefined) continue
    const { voicing } = explainMistake({ headword, expected: e.expected, answer: e.answer }, ctx)
    out.set(e.id, voicing ?? 'rendaku')
  }
  return out
}

/** 숙어 하나를 대표하는 오답. 배지 한 개에 실을 것 */
export interface IdiomMistake {
  type: MistakeType
  /** `type === 'RENDAKU'` 일 때만 채워진다 */
  voicing: VoicingKind | null
  /** 이 숙어에서 그 갈래로 틀린 횟수 */
  wrong: number
}

/**
 * 숙어별 대표 오답 (2026-09-17, 다시보기 배지).
 *
 * 한 숙어를 여러 유형으로 틀리기도 한다. 배지는 하나뿐이라 **제일 자주 낸 갈래**를 고르고,
 * 동점이면 최근 것을 고른다 — 지금 상태에 가까운 쪽이 규칙을 읽을 이유가 된다.
 * 연탁·반탁·연성은 서로 다른 갈래로 센다 (같은 `RENDAKU` 라도 읽을 절이 다르다).
 */
export function mistakeOfIdiom(
  events: readonly ReviewEvent[],
  voicingOf: ReadonlyMap<string, VoicingKind>,
): Map<string, IdiomMistake> {
  const tally = new Map<string, Map<string, { m: IdiomMistake; at: number }>>()
  for (const e of events) {
    const type = e.mistakeType
    if (type === null) continue
    const voicing = type === 'RENDAKU' ? (voicingOf.get(e.id) ?? null) : null
    let byKind = tally.get(e.idiomId)
    if (byKind === undefined) {
      byKind = new Map()
      tally.set(e.idiomId, byKind)
    }
    const hit = byKind.get(`${type}|${voicing ?? ''}`)
    if (hit === undefined) byKind.set(`${type}|${voicing ?? ''}`, { m: { type, voicing, wrong: 1 }, at: e.at })
    else {
      hit.m.wrong++
      if (e.at > hit.at) hit.at = e.at
    }
  }

  const out = new Map<string, IdiomMistake>()
  for (const [idiomId, byKind] of tally) {
    let best: { m: IdiomMistake; at: number } | null = null
    for (const cur of byKind.values()) {
      if (best === null || cur.m.wrong > best.m.wrong || (cur.m.wrong === best.m.wrong && cur.at > best.at)) {
        best = cur
      }
    }
    if (best !== null) out.set(idiomId, best.m)
  }
  return out
}
