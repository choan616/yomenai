// "오늘 맞힌 것으로 읽히는 문장" — 학습의 증거를 점수가 아니라 실제로 읽히는 문장으로 준다.
// 뜻은 아는데 못 읽는 사람이 대상이라, 문장 하나가 술술 읽히는 순간이 이 앱의 보상이다 (PLAN §0)
import type { LearningEvent } from './types.ts'

export interface Readable {
  idiomId: string
  sentence: string
}

/** 이번 세션에서 읽기를 맞힌 숙어 id. 중복은 없애고 처음 맞힌 순서를 유지한다 */
export function correctReadings(session: readonly LearningEvent[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const e of session) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    if (!e.correct || seen.has(e.idiomId)) continue
    seen.add(e.idiomId)
    out.push(e.idiomId)
  }
  return out
}

/**
 * 후보 숙어들의 예문 중 하나를 고른다.
 *
 * **가장 짧은 것**을 고른다 — 짧을수록 "읽혔다"가 분명하고, 끝까지 읽기 전에 포기하지 않는다.
 * 동점이면 idiomId 오름차순이라 같은 입력이면 같은 문장이 나온다.
 *
 * 예문은 무번역(Tatoeba)이라 뜻을 주지 않는다. 여기서 필요한 건 뜻이 아니라 읽힌다는 사실이다
 * (context-notes 2026-09-04 "무번역 예문만 채택").
 */
export function pickReadable(
  ids: readonly string[],
  examples: Map<string, string[]>,
): Readable | null {
  let best: Readable | null = null
  for (const idiomId of [...ids].sort()) {
    for (const sentence of examples.get(idiomId) ?? []) {
      if (best === null || sentence.length < best.sentence.length) best = { idiomId, sentence }
    }
  }
  return best
}
