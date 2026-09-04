// ts-fsrs 래퍼. 카드 타입별로 같은 스케줄러를 쓰되 카드 상태를 따로 들고 간다 (PLAN §6)
import { createEmptyCard, fsrs, generatorParameters, State, type Card, type Grade as FsrsGrade } from 'ts-fsrs'
import type { Grade } from './types.ts'

/**
 * `enable_fuzz: false` 가 핵심이다. 퍼지를 켜면 같은 (카드, 시각, 등급)이 다른 간격을 내서
 * 이벤트 재생이 결정론적이지 않게 된다 (PLAN §5 원칙 2가 무너진다).
 */
export const FSRS_PARAMS = generatorParameters({ enable_fuzz: false })

const scheduler = fsrs(FSRS_PARAMS)

export function newCard(at: number): Card {
  return createEmptyCard(new Date(at))
}

export function applyGrade(card: Card, at: number, grade: Grade): Card {
  return scheduler.next(card, new Date(at), grade as FsrsGrade).card
}

export function isDue(card: Card, now: number): boolean {
  return card.due.getTime() <= now
}

/** 자신감 보정 버튼. 정답일 때만 노출한다 (PLAN §7) */
export type Confidence = 'easy' | 'hard' | null

/**
 * 채점은 자동 판정이라 FSRS 4단계를 다 노출하지 않는다 (PLAN §7).
 * 오답이면 Again, 정답이면 Good 이 기본이고 "쉬웠다"·"헷갈렸다" 두 버튼만 등급을 바꾼다.
 */
export function gradeFor(correct: boolean, confidence: Confidence = null): Grade {
  if (!correct) return 1 // Again
  if (confidence === 'easy') return 4 // Easy
  if (confidence === 'hard') return 2 // Hard
  return 3 // Good
}

/** 뜻이 "안정됐다"고 보는 기준 — 모드 재배치 3단계가 쓴다 */
export const MEANING_STABLE_DAYS = 21

export function isStable(card: Card): boolean {
  return card.state === State.Review && card.stability >= MEANING_STABLE_DAYS
}
