// 이벤트 로그를 접어 카드 상태·음독 집계를 파생시킨다. 상태를 저장하지 않고 매번 재계산한다
import { applyGrade, newCard } from './scheduler.ts'
import {
  cardKey,
  compareEvents,
  type CardState,
  type LearningEvent,
  type MistakeType,
  type OnyomiStat,
  type ReviewEvent,
} from './types.ts'

export interface ReplayOptions {
  /**
   * 숙어 id → (한자, 음독) 쌍 id 목록. 음독은 학습 대상이 아니라 진단 도구라
   * 별도 FSRS 스케줄 없이 읽기 카드 채점 결과를 집계만 한다 (PLAN §6).
   * 주지 않으면 집계를 건너뛴다.
   */
  pairsOf?: (idiomId: string) => string[]
  /**
   * 오답 유형을 **다시 매긴다** (2026-09-17). 주지 않으면 저장된 `mistakeType` 을 쓴다.
   *
   * replay 는 사전을 모르는 순수 접기라 분류기를 고쳐도 저장값을 그대로 셌다. 그래서
   * 규칙 화면에서는 빠진 오답이 **리포트에서는 그 유형으로 남아 있었다.** 사전을 아는 쪽이
   * 함수를 넘겨주는 식으로 푼다 — `pairsOf` 와 같은 관례다.
   */
  mistakeOf?: (e: ReviewEvent) => MistakeType | null
}

export interface ReplayState {
  /** cardKey(idiomId, cardType) → 카드 상태 */
  cards: Map<string, CardState>
  /** idiomId → 진입 진단에서 받은 "뜻을 알고 있었다" 응답 (마지막 응답이 이긴다) */
  meaningKnown: Map<string, boolean>
  /** pairId → 노출·오답 집계 */
  onyomi: Map<string, OnyomiStat>
  /**
   * 찾기에서 담아 둔 숙어 (2026-09-21). 마지막 `star` 이벤트가 이긴다 —
   * 뺀 것은 여기 안 남는다. 이미 카드가 있는 숙어도 담겨 있을 수 있어서
   * **「담겼다」와 「낼 차례다」는 다른 물음이다** — 후자는 `select.ts` 가 판단한다
   */
  starred: Set<string>
  /**
   * 「이 뜻 이상해요」로 신고한 숙어 → 신고 당시 화면에 떠 있던 뜻 (2026-09-22).
   * 마지막 `flag` 이벤트가 이긴다 — 취소한 것은 여기 안 남는다.
   * 카드에 「신고함」을 띄우고, 피드백 화면이 이걸 모아 보낸다
   */
  flagged: Map<string, { headword: string; definition: string }>
  /** 재생에 쓴 이벤트 수 (삭제분 제외) */
  applied: number
}

/**
 * 같은 이벤트 집합이면 입력 순서와 무관하게 같은 상태를 낸다.
 * 정렬을 호출부에 맡기지 않고 안에서 하는 이유는, 기기별 파일을 합집합으로 병합해
 * 넘겨도(PLAN §5 원칙 3) 결과가 흔들리면 안 되기 때문이다.
 */
export function replay(events: LearningEvent[], options: ReplayOptions = {}): ReplayState {
  const state: ReplayState = {
    cards: new Map(),
    meaningKnown: new Map(),
    onyomi: new Map(),
    starred: new Set(),
    flagged: new Map(),
    applied: 0,
  }

  const ordered = events.filter((e) => e.deletedAt === null).sort(compareEvents)

  for (const e of ordered) {
    state.applied++
    if (e.type === 'meaningKnown') {
      state.meaningKnown.set(e.idiomId, e.known)
      continue
    }
    if (e.type === 'star') {
      if (e.on) state.starred.add(e.idiomId)
      else state.starred.delete(e.idiomId)
      continue
    }
    if (e.type === 'flag') {
      if (e.on) state.flagged.set(e.idiomId, { headword: e.headword, definition: e.definition })
      else state.flagged.delete(e.idiomId)
      continue
    }
    /**
     * **모르는 타입은 건너뛴다.** 이 줄이 없으면 아래 채점 경로로 떨어져
     * `applyGrade` 가 `FSRSValidationError: Invalid rating:[undefined]` 로 던지고,
     * 홈·세션·리포트가 모두 재생을 부르므로 화면 전체가 멈춘다 (2026-09-22 실측).
     *
     * 기기 하나가 새 이벤트 타입을 쓰기 시작하면 **아직 옛 빌드를 캐시한 다른 기기**가
     * 동기화로 그걸 받는다. 로그는 append-only 라 지울 수도 없다. 그래서 새 타입을
     * 붙이기 **전에** 이 가드가 배포돼 있어야 한다 — 앞으로의 모든 타입에도 남는 보험이다.
     *
     * 타입 수준에선 여기까지 오면 `ReviewEvent` 뿐이라 늘 참이다. **런타임은 다르다** —
     * 이 빌드가 모르는 타입이 실제로 들어온다. 그래서 지우면 안 되는 줄이다
     */
    if (e.type !== 'review') continue

    const key = cardKey(e.idiomId, e.cardType)
    const prev = state.cards.get(key)
    const card = prev?.card ?? newCard(e.at)
    const next: CardState = {
      idiomId: e.idiomId,
      cardType: e.cardType,
      card: applyGrade(card, e.at, e.grade),
      mistakes: { ...(prev?.mistakes ?? {}) },
      wrong: (prev?.wrong ?? 0) + (e.correct ? 0 : 1),
      streak: e.correct ? (prev?.streak ?? 0) + 1 : 0,
      lastAt: e.at,
    }
    const mistakeType = options.mistakeOf ? options.mistakeOf(e) : e.mistakeType
    if (mistakeType !== null) {
      next.mistakes[mistakeType] = (next.mistakes[mistakeType] ?? 0) + 1
    }
    state.cards.set(key, next)

    if (e.cardType === 'reading' && options.pairsOf) {
      countOnyomi(state.onyomi, options.pairsOf(e.idiomId), e.correct)
    }
  }

  return state
}

function countOnyomi(target: Map<string, OnyomiStat>, pairIds: string[], correct: boolean): void {
  for (const pairId of pairIds) {
    const stat = target.get(pairId) ?? { pairId, seen: 0, wrong: 0 }
    stat.seen++
    if (!correct) stat.wrong++
    target.set(pairId, stat)
  }
}

/** 오답 유형별 전체 발생 횟수. 진단 리포트의 1차 지표다 (PLAN §1 성공 지표) */
export function mistakeTotals(state: ReplayState): Partial<Record<MistakeType, number>> {
  const out: Partial<Record<MistakeType, number>> = {}
  for (const c of state.cards.values()) {
    for (const [type, n] of Object.entries(c.mistakes) as [MistakeType, number][]) {
      out[type] = (out[type] ?? 0) + n
    }
  }
  return out
}
