// 세션의 어느 자리를 환기 퀴즈로 바꿀지 정하는 순수 함수 — 우선순위가 가장 낮은 문제 카드 한 장을 빼고 그 자리에 둔다 (PLAN §11 S4 ②)
import { QUICK_SESSION_LIMIT } from '../app/settings.ts'
import {
  pickQuizQuestions,
  type HomophoneIndex,
  type QuizQuestion,
  type QuizIdiom,
} from '../core/quiz.ts'
import type { SessionCard } from '../core/session.ts'
import type { SessionKind } from './useStudySession.ts'

/** 한 덩어리의 문항 수 */
export const QUIZ_QUESTIONS = 2

export interface QuizPlan {
  /** 퀴즈 자리를 만들려고 카드 한 장을 뺀 결과. 퀴즈가 없으면 입력 그대로다 */
  cards: SessionCard[]
  /** 퀴즈 덩어리는 `cards[at]` **앞에** 들어간다. 진행 분모 = `cards.length + (quiz ? 1 : 0)` */
  quiz: { at: number; questions: QuizQuestion[] } | null
}

/**
 * 세션 중간에 객관식 2문항 덩어리 하나를 넣을 자리를 정한다. 기록은 안 남긴다.
 *
 * **세션을 길게 만들지 않는다** — 채점 카드 한 장을 빼고 그 자리에 퀴즈를 둔다 (사용자 결정 2026-10-24
 * 「복습 한 장 양보」). 뺄 카드는 **선택 우선순위가 가장 낮은 문제 카드**(`rank` 최대) — 설정 장수가
 * 하나 적었다면 뽑히지 않았을 카드다. 대개 기한을 가장 조금 넘긴 복습이고, 기한(FSRS)은 그대로라
 * 다음 세션에 나온다. 소개 카드는 안 뺀다(문제 수에 안 든다). 첫 장도 안 뺀다 — 홈이 내민 카드(`leadWith`)다.
 * 같은 숙어의 카드가 둘(읽기·뜻)이면 **단독인 카드를 먼저** 고르고, 단독이 없을 때만 둘짜리의 한 장을 뺀다.
 * 남는 한 장은 읽기만 또는 뜻만 있는 숙어의 모양이라 순서 규칙(`readingFirst`)이 깨지지 않는다.
 *
 * **문항 재료**는 ① 퀴즈 앞에 지나온 세션 카드(가까운 것부터), 모자라면 ② `learned`(예전에 푼 표현,
 * 최근에 푼 것부터)다. 세션 카드만으로는 동음이의 보기를 셋 이상 낼 수 있는 표현이 2% 남짓이라
 * 퀴즈가 거의 안 섰다(2026-10-24 실측). ②도 노출 방지는 같다 — 뺀 숙어와 퀴즈 뒤에 카드가 남은
 * 숙어는 **표기 단위로** 정답·보기 양쪽에서 빠진다. 보기(오답)는 어느 쪽이든 사전에서 읽기가
 * 같거나 비슷한 묶음에서 나온다(`core/quiz.ts`).
 *
 * 퀴즈를 못 내는 경우(보통 세션이 아니거나, 짧은 세션이거나, 뺄 카드·문항이 없을 때)는
 * `cards` 를 그대로 돌려주고 `quiz` 는 null 이다. 난수는 문항을 확정할 수 있을 때만 쓴다.
 */
export function planQuiz<T extends QuizIdiom>(input: {
  cards: readonly SessionCard[]
  introIds: ReadonlySet<string>
  kind: SessionKind
  /** 설정의 세션 장수(문제 수) */
  questionLimit: number
  index: HomophoneIndex<T>
  rand: () => number
  /**
   * 이 세션 **이전에** 읽기·뜻 카드를 채점받은 적 있는 숙어 id, 최근에 푼 것부터.
   * 세션 카드로 문항이 모자랄 때 채우는 재료다. 안 주면 세션 카드만 쓴다
   */
  learned?: readonly string[]
}): QuizPlan {
  const { cards, introIds, kind, questionLimit, index, rand, learned } = input
  const none: QuizPlan = { cards: [...cards], quiz: null }
  if (kind !== 'normal' || questionLimit <= QUICK_SESSION_LIMIT) return none

  const perIdiom = new Map<string, number>()
  for (const c of cards) perIdiom.set(c.idiomId, (perIdiom.get(c.idiomId) ?? 0) + 1)

  // 우선순위가 가장 낮은(rank 최대) 문제 카드. 단독 카드가 먼저, 동순위면 뒤쪽 자리.
  // rank 가 없는 카드(재대결·집중 세션은 여기 안 온다)는 -1 로 보아 자리 순서만 따른다
  let removeAt = -1
  let bestSingle = false
  let bestRank = -1
  for (let i = cards.length - 1; i >= 1; i--) {
    const c = cards[i]!
    if (introIds.has(c.idiomId)) continue
    const single = perIdiom.get(c.idiomId) === 1
    const rank = c.rank ?? -1
    if (removeAt < 0 || (single && !bestSingle) || (single === bestSingle && rank > bestRank)) {
      removeAt = i
      bestSingle = single
      bestRank = rank
    }
  }
  if (removeAt < 0) return none
  const removedId = cards[removeAt]!.idiomId
  const rest = cards.filter((_, i) => i !== removeAt)

  // 남은 문제 카드(소개 제외)의 절반(올림) 다음. 문제가 한 장뿐이면 끝자리가 되어 「중간」이 아니다
  const total = rest.reduce((n, c) => n + (introIds.has(c.idiomId) ? 0 : 1), 0)
  if (total < 2) return none
  const half = Math.ceil(total / 2)
  let at = 0
  for (let seen = 0; at < rest.length && seen < half; at++) {
    if (!introIds.has(rest[at]!.idiomId)) seen++
  }

  // 퀴즈는 읽기를 보여 주고 답 뒤에 보기마다 뜻을 보여 준다 — 퀴즈 뒤에 카드(읽기·뜻 어느 쪽이든)가
  // 남은 숙어는 정답으로도 보기로도 못 쓴다. 그 카드의 답이 미리 드러난다
  const exclude = new Set<string>([removedId])
  for (const c of rest.slice(at)) exclude.add(c.idiomId)

  // 동형이독은 표기 하나에 숙어가 둘이다(早々 はやばや·そうそう). idiomId 로만 가리면 짝이
  // 안 걸려, 뒤에 남은 「읽기 둘」 카드의 답 절반이 퀴즈 보기로 먼저 드러난다
  for (const id of [...exclude]) {
    const hw = index.byId.get(id)?.headword
    if (hw === undefined) continue
    for (const other of index.byHeadword.get(hw) ?? []) exclude.add(other)
  }

  // 이미 지나온 숙어만, 가까운 것부터 (소개 숙어도 읽기·뜻을 이미 보여 준 것이라 쓴다)
  const candidates: string[] = []
  const seenIds = new Set<string>()
  for (let i = at - 1; i >= 0; i--) {
    const id = rest[i]!.idiomId
    if (seenIds.has(id) || exclude.has(id)) continue
    seenIds.add(id)
    candidates.push(id)
  }

  // ② 예전에 푼 표현 — 세션에 카드가 있는 숙어는 위 ①이 이미 다뤘거나(앞) exclude 에 걸린다(뒤)
  if (learned !== undefined) {
    const inSession = new Set(cards.map((c) => c.idiomId))
    for (const id of learned) {
      if (seenIds.has(id) || inSession.has(id) || exclude.has(id)) continue
      seenIds.add(id)
      candidates.push(id)
    }
  }

  const questions = pickQuizQuestions(candidates, index, QUIZ_QUESTIONS, rand, exclude)
  if (questions.length < QUIZ_QUESTIONS) return none
  return { cards: rest, quiz: { at, questions } }
}
