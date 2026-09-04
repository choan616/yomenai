// 이벤트 로그를 접어 카드 상태·음독 집계를 파생시킨다. 상태를 저장하지 않고 매번 재계산한다
import { applyGrade, newCard } from './scheduler.ts'
import {
  cardKey,
  compareEvents,
  type CardState,
  type LearningEvent,
  type MistakeType,
  type OnyomiStat,
} from './types.ts'

export interface ReplayOptions {
  /**
   * 숙어 id → (한자, 음독) 쌍 id 목록. 음독은 학습 대상이 아니라 진단 도구라
   * 별도 FSRS 스케줄 없이 읽기 카드 채점 결과를 집계만 한다 (PLAN §6).
   * 주지 않으면 집계를 건너뛴다.
   */
  pairsOf?: (idiomId: string) => string[]
}

export interface ReplayState {
  /** cardKey(idiomId, cardType) → 카드 상태 */
  cards: Map<string, CardState>
  /** idiomId → 진입 진단에서 받은 "뜻을 알고 있었다" 응답 (마지막 응답이 이긴다) */
  meaningKnown: Map<string, boolean>
  /** pairId → 노출·오답 집계 */
  onyomi: Map<string, OnyomiStat>
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
    applied: 0,
  }

  const ordered = events.filter((e) => e.deletedAt === null).sort(compareEvents)

  for (const e of ordered) {
    state.applied++
    if (e.type === 'meaningKnown') {
      state.meaningKnown.set(e.idiomId, e.known)
      continue
    }

    const key = cardKey(e.idiomId, e.cardType)
    const prev = state.cards.get(key)
    const card = prev?.card ?? newCard(e.at)
    const next: CardState = {
      idiomId: e.idiomId,
      cardType: e.cardType,
      card: applyGrade(card, e.at, e.grade),
      mistakes: { ...(prev?.mistakes ?? {}) },
      lastAt: e.at,
    }
    if (e.mistakeType !== null) {
      next.mistakes[e.mistakeType] = (next.mistakes[e.mistakeType] ?? 0) + 1
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
