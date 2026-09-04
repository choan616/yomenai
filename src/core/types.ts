// 학습 코어의 도메인 타입 — 카드·이벤트·오답 유형. 스키마 불변 조건(CLAUDE.md)의 단일 출처
import type { Card } from 'ts-fsrs'

/** 숙어 하나에 붙는 카드 종류. 망각 곡선이 달라 FSRS 스케줄을 따로 건다 (PLAN §6) */
export type CardType = 'reading' | 'meaning'

/** 학습 모드. correction = 읽기 교정(1차), expansion = 어휘 확장(2차) */
export type StudyMode = 'correction' | 'expansion'

/**
 * 오답 유형 (PLAN §6). 자동 판정은 src/core/mistakes.ts.
 * `OKURIGANA` 는 아직 분류기가 내지 않는다 — 동사·형용사형(오쿠리가나 포함) 확장에 대비해
 * 스키마 불변 조건인 이 enum 에 자리만 미리 잡아둔 것이다 (context-notes 2026-09-04 절).
 */
export type MistakeType =
  | 'ONYOMI_CHOICE'
  | 'RENDAKU'
  | 'SOKUON'
  | 'CHOON'
  | 'MIXED_READING'
  | 'KO_INTERFERENCE'
  | 'OKURIGANA'

/** 한국어 대조 분류 (Phase 3). 1=동형동의 2=동형이의 3=일본 고유 */
export type KoreanCategory = 1 | 2 | 3

/** 모드가 어느 단계에서 정해졌는지 (PLAN §6 "모드 자동 배정 3단계") */
export type ModeSource = 'korean-class' | 'diagnostic' | 'reassign'

/** FSRS 채점 등급. ts-fsrs Rating 의 Manual 을 제외한 4단계와 같은 값이다 */
export type Grade = 1 | 2 | 3 | 4

/**
 * append-only 학습 이벤트. 절대 갱신하지 않고 새 이벤트를 덧붙인다 (PLAN §5 원칙 2).
 *
 * CLAUDE.md 스키마 불변 조건에 따라 v1부터 다음을 전 이벤트가 가진다.
 * - `userId` (복합 PK 구성 요소)
 * - `deletedAt` 소프트 삭제
 * - `cardType`
 * - `mistakeType` (해당 없으면 null)
 */
export interface EventBase {
  /** 시간순 정렬이 되는 이벤트 ID. 기기 간 병합의 합집합 키 */
  id: string
  userId: string
  /** 기기별 파일 분리 동기화의 키 (PLAN §5 원칙 3) */
  deviceId: string
  /** 발생 시각 (epoch ms). FSRS 재생의 now 로도 쓰인다 */
  at: number
  idiomId: string
  cardType: CardType
  mistakeType: MistakeType | null
  deletedAt: number | null
}

/** 카드 1장을 채점한 기록 */
export interface ReviewEvent extends EventBase {
  type: 'review'
  grade: Grade
  /** 사용자 입력 (히라가나 정규화 후). meaning 카드는 빈 문자열 */
  answer: string
  expected: string
  correct: boolean
  elapsedMs: number
}

/** 진입 진단의 "뜻은 알고 계셨나요" 응답. 모드 배정 2단계의 입력 */
export interface MeaningKnownEvent extends EventBase {
  type: 'meaningKnown'
  cardType: 'meaning'
  mistakeType: null
  known: boolean
}

export type LearningEvent = ReviewEvent | MeaningKnownEvent

/** 이벤트 재생으로 파생되는 카드 1장의 상태. 저장하지 않고 언제든 재계산한다 */
export interface CardState {
  idiomId: string
  cardType: CardType
  card: Card
  /** 오답 유형별 누적 횟수 */
  mistakes: Partial<Record<MistakeType, number>>
  lastAt: number | null
}

/** (한자, 음독) 쌍의 파생 집계. 별도 FSRS 스케줄을 걸지 않는다 (PLAN §6) */
export interface OnyomiStat {
  pairId: string
  seen: number
  wrong: number
}

/** 카드 1장의 안정적 키 */
export function cardKey(idiomId: string, cardType: CardType): string {
  return `${idiomId}:${cardType}`
}

/**
 * 재생 순서의 단일 기준. 같은 시각이면 id 로 갈라 완전 순서를 만든다.
 * 기기별 파일을 합집합으로 병합해도(PLAN §5 원칙 3) 재생 결과가 흔들리지 않게 하는 장치다.
 */
export function compareEvents(a: LearningEvent, b: LearningEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

const ID_RANDOM_LEN = 10

/**
 * 시간순으로 정렬되는 이벤트 ID.
 * `at` 을 base36 13자리로 고정 폭 인코딩해 문자열 비교가 곧 시간 비교가 되게 하고,
 * 뒤에 난수를 붙여 같은 밀리초·다른 기기의 충돌을 막는다.
 */
export function newEventId(at: number, rand: () => number = Math.random): string {
  const ts = Math.floor(at).toString(36).padStart(13, '0')
  let tail = ''
  for (let i = 0; i < ID_RANDOM_LEN; i++) tail += Math.floor(rand() * 36).toString(36)
  return `${ts}-${tail}`
}
