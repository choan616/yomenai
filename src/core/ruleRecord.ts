// 규칙 절에 붙는 "내가 이 규칙으로 틀린 기록" 을 파생시킨다 (2026-09-17).
//
// 규칙 화면을 읽을거리가 아니라 색인으로 만드는 부분이다 — 해설만 있는 문서는 다시 안 열린다.
// 새 이벤트도, 새 저장도 없다.
//
// 이벤트를 직접 훑는다(`ReplayState` 가 아니라). 연탁·반탁·연성은 한 유형(`RENDAKU`)으로
// 저장되므로 절을 가르려면 **그 이벤트의 답**이 필요한데, replay 가 접고 나면 답이 없다.
// 이벤트에는 `answer`·`expected` 가 남아 있어 갈래를 언제든 다시 매길 수 있다 —
// 지난 기록에도 소급된다 (스키마는 그대로, CLAUDE.md 불변 조건).
import {
  explainMistake,
  type MistakeContext,
  type MistakeVerdict,
  type VoicingKind,
} from './mistakes.ts'
import type { FrequentIdiom, NamedIdiom } from './report.ts'
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
 * `RENDAKU` 로 저장된 이벤트를 **지금 분류기로 다시 매긴다** (2026-09-17).
 *
 * 처음엔 갈래(연탁·반탁·연성)만 다시 매겼다. 유형은 맞다고 보고 저장값을 썼다.
 * **그 전제가 틀렸다** — 분류기가 탁음 오답을 과하게 `RENDAKU` 로 보내고 있었고
 * (月額 げつがく ← げつかく), 고친 뒤에도 지난 이벤트는 저장된 유형 때문에 계속 연탁으로
 * 보였다. 저장값을 고칠 수는 없으니(스키마 불변 조건) **읽을 때 다시 매긴다.**
 *
 * 다시 매긴 유형이 `RENDAKU` 가 아니면 그 절에서 빠지고, `null` 이면 어느 절에도 안 든다
 * (리포트의 `unclassified` 와 같은 자리다). 다시 못 매기면(숙어를 모르면) 항목을 안 넣어
 * 저장된 유형이 그대로 쓰인다.
 *
 * 규칙 화면과 다시보기가 **같은 함수**를 쓴다. 두 곳에서 따로 매기면 배지가 가리키는 절과
 * 규칙 화면이 언젠가 갈라진다. `RENDAKU` 로 남은 이벤트의 갈래를 못 가리면 연탁으로 둔다.
 */
export function verdictByEvent(
  events: readonly ReviewEvent[],
  ctx: MistakeContext,
  headwordOf: (idiomId: string) => string | undefined,
): Map<string, MistakeVerdict> {
  const again = reclassifier(ctx, headwordOf)
  const out = new Map<string, MistakeVerdict>()
  for (const e of events) {
    if (e.mistakeType !== 'RENDAKU') continue
    if (headwordOf(e.idiomId) === undefined) continue
    out.set(e.id, again(e))
  }
  return out
}

/**
 * 이벤트 하나를 지금 분류기로 다시 매기는 함수를 만든다 (2026-09-17, 노출 경로 일관성).
 *
 * **다시 매기는 자리가 여럿이면 언젠가 갈라진다.** 규칙 화면·다시보기는 `verdictByEvent`
 * 로, 리포트는 `replay` 의 `mistakeOf` 로 들어오는데 둘 다 이 함수를 지난다.
 *
 * `RENDAKU` 로 저장된 것만 다시 본다 — 그 축만 분류기를 고쳤다. 숙어를 모르면 저장값을
 * 그대로 돌려준다. 근거 없이 판정을 바꾸지 않는다.
 */
export function reclassifier(
  ctx: MistakeContext,
  headwordOf: (idiomId: string) => string | undefined,
): (e: ReviewEvent) => MistakeVerdict {
  return (e) => {
    const stored: MistakeVerdict = { type: e.mistakeType, voicing: null }
    if (e.mistakeType !== 'RENDAKU') return stored
    const headword = headwordOf(e.idiomId)
    if (headword === undefined) return stored
    const v = explainMistake({ headword, expected: e.expected, answer: e.answer }, ctx)
    return v.type === 'RENDAKU' ? { type: 'RENDAKU', voicing: v.voicing ?? 'rendaku' } : v
  }
}

/**
 * 이 이벤트를 **지금** 어느 규칙으로 읽어야 하나. 다시 매긴 게 있으면 그것, 없으면 저장값.
 *
 * 규칙 화면의 절 색인과 다시보기 배지가 둘 다 이걸 통해서만 유형을 본다 — 한 곳에서만
 * 고치면 배지와 절이 갈라진다.
 */
export function effectiveMistake(
  e: ReviewEvent,
  verdictOf: ReadonlyMap<string, MistakeVerdict>,
): { type: MistakeType; voicing: VoicingKind | null } | null {
  const v = verdictOf.get(e.id)
  if (v === undefined) return e.mistakeType === null ? null : { type: e.mistakeType, voicing: null }
  return v.type === null ? null : { type: v.type, voicing: v.voicing }
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
  verdictOf: ReadonlyMap<string, MistakeVerdict>,
): Map<string, IdiomMistake> {
  const tally = new Map<string, Map<string, { m: IdiomMistake; at: number }>>()
  for (const e of events) {
    const now = effectiveMistake(e, verdictOf)
    if (now === null) continue
    const { type, voicing } = now
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

/**
 * 탁음 바구니 안의 갈래별 횟수 (2026-09-17, 노출 경로 일관성).
 *
 * **분포 표시와 처방 문턱은 다른 축이다.** 리포트가 「연탁 5회」 한 칸으로만 보여줘서
 * 반탁만 틀린 사람도 「연탁」이라는 이름을 받고 있었다. 이름은 갈래로 나누고, 처방이 뜨는
 * 문턱(`DOMINANT_SHARE`)은 묶은 채로 둔다 — 셋으로 쪼개면 반탁 처방은 영원히 안 뜬다
 * (반탁이 탁음 오답의 26%라, 전체 오답의 30%를 넘으려면 탁음 오답이 전체의 116%여야 한다).
 *
 * `replay` 가 아니라 이벤트를 직접 센다. 갈래는 저장돼 있지 않고 답에서 다시 매기는 값이라
 * 순수 접기 안에서는 못 구한다 — `ruleRecord` 가 같은 이유로 이벤트를 직접 훑는다.
 */
export function voicingCounts(
  events: readonly ReviewEvent[],
  again: (e: ReviewEvent) => MistakeVerdict,
): Record<VoicingKind, number> {
  const out: Record<VoicingKind, number> = { rendaku: 0, handaku: 0, renjo: 0, unmarked: 0 }
  for (const e of events) {
    const v = again(e)
    if (v.type === 'RENDAKU') out[v.voicing ?? 'rendaku']++
  }
  return out
}

/**
 * 오답 유형(+탁음이면 갈래)이 정확히 일치하는 숙어만 모은다 (2026-09-18, 리포트
 * "다시보기" 진입점).
 *
 * `ruleRecord` 와 갈래는 같지만 반환 형태가 다르다 — 저건 절 색인용으로 상위 N개만
 * 자르고 정렬도 오답 많은 순으로 고정하는데, 여기는 다시보기(`pickBrowse`)로 넘겨
 * 섞고 자를 몫이라 `frequentIdioms` 와 같은 규약(전량 반환, id 순 고정)을 따른다.
 */
export function frequentIdiomsByMistake(
  events: readonly ReviewEvent[],
  verdictOf: ReadonlyMap<string, MistakeVerdict>,
  type: MistakeType,
  voicing: VoicingKind | null,
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined,
): FrequentIdiom[] {
  const byIdiom = new Map<string, number>()
  for (const e of events) {
    const v = effectiveMistake(e, verdictOf)
    if (v === null || v.type !== type || v.voicing !== voicing) continue
    byIdiom.set(e.idiomId, (byIdiom.get(e.idiomId) ?? 0) + 1)
  }
  const rows: FrequentIdiom[] = []
  for (const [id, wrong] of byIdiom) {
    const n = nameOf(id)
    if (n) rows.push({ id, headword: n.headword, reading: n.reading, wrong })
  }
  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return rows
}

/** 그 바구니에서 제일 많은 갈래. 동점이면 연탁 — 대표 절이다. 비어 있으면 null */
export function dominantVoicing(counts: Record<VoicingKind, number>): VoicingKind | null {
  const order: VoicingKind[] = ['rendaku', 'handaku', 'renjo', 'unmarked']
  let best: VoicingKind | null = null
  for (const k of order) {
    if (counts[k] > 0 && (best === null || counts[k] > counts[best])) best = k
  }
  return best
}
