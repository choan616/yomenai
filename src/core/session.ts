// 학습 코어의 조립 지점 — 세션 구성과 답안 기록. 화면은 이 파일만 부르면 된다
import type { Band } from '../lib/bands.ts'
import { toHiragana } from '../lib/readings.ts'
import { classifyMistake, type MistakeContext } from './mistakes.ts'
import { assignMode } from './mode.ts'
import { replay, type ReplayState } from './replay.ts'
import { gradeFor, type Confidence } from './scheduler.ts'
import {
  selectSession,
  type SelectOptions,
  type SessionCandidate,
  type SessionItem,
} from './select.ts'
import {
  cardKey,
  newEventId,
  type KoreanCategory,
  type LearningEvent,
  type MeaningKnownEvent,
  type ReviewEvent,
} from './types.ts'

/**
 * 한국어 분류의 출처 (Phase 3 `korean-class.json`).
 * `manual` 만 사람이 확정한 것이고 `llm`(초벌)·`default`(잠정)는 미확정이다.
 */
export type ClassSource = 'manual' | 'llm' | 'default'

/** 사전 DB 에서 뽑아 오는 숙어 1개의 학습용 정보 */
export interface IdiomEntry {
  idiomId: string
  band: Band
  category: KoreanCategory
  classSource: ClassSource
  /** 구성 (한자, 음독) 쌍 id */
  pairIds: string[]
}

export interface SessionCard extends SessionItem {
  /**
   * 처음 나오는 카드인데 한국어 분류가 미확정이다.
   * Phase 3 가 검수 일부를 여기까지 미뤄뒀다 — 카드 풀 진입 시점에 확인을 받는다.
   * 확인 결과는 `recordMeaningKnown` 이벤트로 남고 모드 배정 2단계가 그걸 즉시 반영한다.
   */
  needsClassReview: boolean
}

export interface Session {
  cards: SessionCard[]
  /** 세션을 고를 때 쓴 재생 상태. 화면이 카드 상태를 다시 계산하지 않게 같이 준다 */
  state: ReplayState
}

/**
 * 이벤트 로그와 숙어 풀로 다음 세션을 만든다.
 * 재생 → 모드 배정 → 출제 선택이 한 줄기로 이어지는 지점이며, 화면과 시뮬레이션이
 * 같은 경로를 타게 하려고 여기 하나로 모았다.
 */
export function buildSession(
  pool: IdiomEntry[],
  events: LearningEvent[],
  options: SelectOptions,
): Session {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })

  const candidates: SessionCandidate[] = pool.map((p) => ({
    idiomId: p.idiomId,
    band: p.band,
    pairIds: p.pairIds,
    mode: assignMode({
      category: p.category,
      meaningKnown: state.meaningKnown.get(p.idiomId),
      meaningCard: state.cards.get(cardKey(p.idiomId, 'meaning'))?.card,
    }).mode,
  }))

  // 확인은 숙어 단위라 한 세션에서 같은 숙어의 읽기·뜻 카드가 같이 나와도 한 번만 묻는다
  const asked = new Set<string>()
  const cards = selectSession(candidates, state, options).map((item) => {
    const needsClassReview =
      !item.due &&
      byId.get(item.idiomId)?.classSource !== 'manual' &&
      // 이미 확인을 받았으면(meaningKnown 이벤트가 있으면) 다시 묻지 않는다
      !state.meaningKnown.has(item.idiomId) &&
      !asked.has(item.idiomId)
    if (needsClassReview) asked.add(item.idiomId)
    return { ...item, needsClassReview }
  })

  return { cards, state }
}

export interface AnswerContext {
  userId: string
  deviceId: string
  /** 답안을 낸 시각 (epoch ms). FSRS 재생의 now 로도 쓰인다 */
  at: number
  elapsedMs: number
  /** 이벤트 id 의 난수 부분. 테스트에서 결정론을 얻으려고 주입한다 */
  rand?: () => number
}

/**
 * 읽기 정오답은 문자열 비교로 자동 판정한다.
 * 가타카나 입력과 앞뒤 공백을 정규화한다 — wanakana 가 붙은 입력 필드라도
 * 변환이 덜 끝난 상태로 제출될 수 있다.
 */
export function isCorrectReading(expected: string, answer: string): boolean {
  const a = toHiragana(answer.trim())
  return a !== '' && a === toHiragana(expected.trim())
}

/** 읽기 카드 채점 — 정오답 판정과 오답 유형 분류를 한 번에 한다 */
export function recordReadingAnswer(input: {
  item: SessionItem
  headword: string
  /** 정답 읽기 */
  reading: string
  /** 사용자 입력 */
  answer: string
  confidence?: Confidence
  ctx: AnswerContext
  mistakes: MistakeContext
}): ReviewEvent {
  const { item, headword, reading, answer, ctx } = input
  const correct = isCorrectReading(reading, answer)
  return {
    ...base(item.idiomId, 'reading', ctx),
    type: 'review',
    mistakeType: correct
      ? null
      : classifyMistake({ headword, expected: reading, answer }, input.mistakes),
    grade: gradeFor(correct, input.confidence ?? null),
    answer,
    expected: reading,
    correct,
    elapsedMs: ctx.elapsedMs,
  }
}

/** 뜻 카드 채점 — 자기 채점이라 정오답을 화면이 준다 */
export function recordMeaningAnswer(input: {
  item: SessionItem
  correct: boolean
  confidence?: Confidence
  ctx: AnswerContext
}): ReviewEvent {
  const { item, correct, ctx } = input
  return {
    ...base(item.idiomId, 'meaning', ctx),
    type: 'review',
    mistakeType: null,
    grade: gradeFor(correct, input.confidence ?? null),
    answer: '',
    expected: '',
    correct,
    elapsedMs: ctx.elapsedMs,
  }
}

/**
 * "뜻은 알고 계셨나요" 응답.
 * 진입 진단이 쓰고, `needsClassReview` 가 붙은 카드의 지연 검수 답도 여기로 들어온다.
 * 모드 배정 2단계가 이 값을 미확정 분류보다 우선한다.
 */
export function recordMeaningKnown(input: {
  idiomId: string
  known: boolean
  ctx: AnswerContext
}): MeaningKnownEvent {
  return {
    ...base(input.idiomId, 'meaning', input.ctx),
    cardType: 'meaning',
    mistakeType: null,
    type: 'meaningKnown',
    known: input.known,
  }
}

function base(idiomId: string, cardType: 'reading' | 'meaning', ctx: AnswerContext) {
  return {
    id: newEventId(ctx.at, ctx.rand),
    userId: ctx.userId,
    deviceId: ctx.deviceId,
    at: ctx.at,
    idiomId,
    cardType,
    deletedAt: null,
  }
}
