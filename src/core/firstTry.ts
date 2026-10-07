// 규칙 절별 첫 만남 정답률 — 복습 항목의 정답은 암기일 수 있어 전이의 증거가 못 된다 (2026-10-07, 교수자 관점 보완 B1)
import { compareEvents } from './types.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

/**
 * 재는 절 넷 — 촉음·연탁·반탁·연성. `decompose` 의 `Segment.variants` 가 내는 값과 같다.
 * 장음·한국음 꼬리·청탁 미구분·음독 층위·혼독은 애초에 예측 규칙이 아니라 여기 없다 (PLAN §6).
 */
export type MeasuredVariant = 'sokuon' | 'rendaku' | 'handaku' | 'renjo'

/**
 * 이만큼 안 모이면 화면이 비율을 안 보인다 (2026-10-07, 교수자 관점 보완 8단계).
 *
 * 집계(`firstTryByRule`)는 이 값을 모른다 — 문턱은 **그리는 쪽**(`Rules.tsx`)에서만 쓴다.
 * 여기 두는 이유는 A 축의 `PACE_MIN_SAMPLE` 과 같은 자리에서 같이 관리하기 위해서다.
 * 실측(연성 1개로 0% 가 뜬 사례)으로 5 를 골랐다 — 20 은 반탁(17개, 41.2%)까지 지운다
 * (decisions.md 「처방 — 규칙 축에도 대조를 연다」).
 */
export const FIRST_TRY_MIN_SAMPLE = 5

export interface FirstTryRate {
  /** 그 규칙이 걸린 숙어를 처음 만난 횟수 */
  seen: number
  /** 그중 맞힌 횟수 */
  correct: number
}

/**
 * 절별 첫 만남 정답률. 재지 않는 절은 Map 에 아예 넣지 않는다.
 *
 * `appliesTo` 는 호출부가 사전(`decompose` 결과)을 들고 넘긴다 — 이 함수는 사전을 모른다
 * (`ruleRecord.ts` 와 같은 규약). 「첫 만남」은 그 카드(`idiomId` + `cardType: 'reading'`)의
 * 시간순 첫 `review` 이벤트 하나뿐이다 — 그 뒤로 몇 번을 더 맞혀도 이 숫자는 안 올라간다.
 */
export function firstTryByRule(
  events: readonly LearningEvent[],
  appliesTo: (idiomId: string) => Set<MeasuredVariant>,
): Map<MeasuredVariant, FirstTryRate> {
  const firstByIdiom = new Map<string, ReviewEvent>()
  for (const e of events) {
    if (e.type !== 'review' || e.deletedAt !== null || e.cardType !== 'reading') continue
    const cur = firstByIdiom.get(e.idiomId)
    if (cur === undefined || compareEvents(e, cur) < 0) firstByIdiom.set(e.idiomId, e)
  }

  const out = new Map<MeasuredVariant, FirstTryRate>()
  for (const [idiomId, first] of firstByIdiom) {
    for (const rule of appliesTo(idiomId)) {
      const rate = out.get(rule) ?? { seen: 0, correct: 0 }
      rate.seen++
      if (first.correct) rate.correct++
      out.set(rule, rate)
    }
  }
  return out
}
