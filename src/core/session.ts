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
  type CardState,
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

export interface RematchOptions {
  now: number
  limit: number
  /** 테스트가 고정 난수를 넣는 자리 — `newEventId` 와 같은 관례 */
  rand?: () => number
}

/**
 * 마지막 오답 이후 이만큼 연속으로 맞히면 재대결 후보에서 뺀다.
 * `wrong` 은 누적이라 줄지 않으므로, 이 기준이 없으면 이미 극복한 숙어가 후보에 영원히 남는다.
 */
export const REMATCH_CLEARED_STREAK = 2

function isRematchCandidate(card: CardState): boolean {
  return card.cardType === 'reading' && card.wrong > 0 && card.streak < REMATCH_CLEARED_STREAK
}

/**
 * 오답 수를 가중치로 두고 중복 없이 `k` 개를 뽑는다.
 * 자주 틀린 숙어가 더 자주 나오되 매번 조합이 달라진다.
 */
function pickWeighted<T>(pool: { item: T; weight: number }[], k: number, rand: () => number): T[] {
  const rest = [...pool]
  let total = rest.reduce((sum, c) => sum + c.weight, 0)
  const picked: T[] = []
  while (picked.length < k && rest.length > 0) {
    let r = rand() * total
    let i = 0
    while (i < rest.length - 1 && r >= rest[i].weight) {
      r -= rest[i].weight
      i++
    }
    picked.push(rest[i].item)
    total -= rest[i].weight
    rest.splice(i, 1)
  }
  return picked
}

/**
 * 재대결 세션 — 예전에 틀린 읽기 카드만 모은다. 기한을 무시한다.
 *
 * 복습 기한을 기다리지 않고 다시 붙는 게 이 세션의 전부라서, 정규 세션의 선택 로직
 * (`selectSession`)을 타지 않는다. 대신 **오답 수를 가중치로 둔 무작위 추출**로 고른다 —
 * 결정적으로 정렬해 앞에서 자르면 매번 같은 카드만 나온다 (2026-09-11 사용자 지적).
 * 마지막 오답 이후 `REMATCH_CLEARED_STREAK` 번 연속으로 맞힌 카드는 후보에서 뺀다.
 *
 * **기한을 무시하는 대가.** 답안은 정규 이벤트로 기록되므로 FSRS 일정에 영향을 준다.
 * 이르게 맞히면 안정도가 덜 오르고, 틀리면 정상적으로 lapse 가 잡힌다. 후자가 맞는
 * 정보라서 그대로 둔다 — "연습용 채점"을 따로 두려면 이벤트 스키마에 값을 늘려야 하는데
 * 스키마는 불변 조건이다.
 */
export function buildRematch(
  pool: IdiomEntry[],
  events: LearningEvent[],
  options: RematchOptions,
): Session {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })

  const candidates: { item: SessionItem; weight: number }[] = []
  for (const [, card] of state.cards) {
    if (!isRematchCandidate(card)) continue
    const entry = byId.get(card.idiomId)
    if (entry === undefined) continue
    candidates.push({
      item: {
        idiomId: card.idiomId,
        cardType: 'reading',
        mode: assignMode({
          category: entry.category,
          meaningKnown: state.meaningKnown.get(card.idiomId),
          meaningCard: state.cards.get(cardKey(card.idiomId, 'meaning'))?.card,
        }).mode,
        due: card.card.due.getTime() <= options.now,
      },
      weight: card.wrong,
    })
  }

  // 뽑기 전에 id 로 세운다 — Map 순회 순서(이벤트 병합 순서)에 결과가 휘둘리지 않게
  candidates.sort((a, b) => (a.item.idiomId < b.item.idiomId ? -1 : 1))

  // 재대결은 확인 질문을 끼우지 않는다 — 이미 만난 숙어들이라 물어볼 게 없다
  const cards: SessionCard[] = pickWeighted(
    candidates,
    options.limit,
    options.rand ?? Math.random,
  ).map((item) => ({ ...item, needsClassReview: false }))

  return { cards, state }
}

/** 재대결 후보 수. 홈에서 버튼을 띄울지 정하는 데 쓴다 */
export function rematchCount(pool: IdiomEntry[], events: LearningEvent[]): number {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
  let n = 0
  for (const [, card] of state.cards) {
    if (isRematchCandidate(card) && byId.has(card.idiomId)) n++
  }
  return n
}

export interface FocusOptions {
  /** 집중할 (한자, 음독) 쌍 */
  pairId: string
  now: number
  limit: number
  /**
   * 그 숙어에서 이 쌍이 실제로 어떤 **표면형**으로 나타나는지 (`surfaceOfPair`).
   *
   * 주면 표면형이 갈리게 번갈아 낸다 — 発達 はっ 다음에 発言 はつ. 같은 유형만 연달아
   * 주면 "이 자리엔 항상 촉음"이라는 과잉일반화가 생겨 새 오답이 만들어진다.
   * 규칙의 *경계*는 대조로만 배운다 (context-notes 2026-09-07).
   */
  surfaceOf?: (idiomId: string) => string | null
}

/**
 * 정렬을 유지한 채 표면형 그룹 사이를 번갈아 낸다.
 *
 * 그룹 안의 순서(틀린 것 먼저)는 그대로라 각 그룹의 앞머리부터 나가고, 그룹이 하나뿐이면
 * 입력을 그대로 돌려준다 — 대조할 게 없는데 순서만 흔들지 않는다.
 */
function interleaveBySurface<T>(items: T[], surfaceOf: (item: T) => string | null): T[] {
  const groups = new Map<string, T[]>()
  for (const it of items) {
    const key = surfaceOf(it) ?? ''
    const g = groups.get(key)
    if (g === undefined) groups.set(key, [it])
    else g.push(it)
  }
  if (groups.size < 2) return items

  const buckets = [...groups.values()]
  const out: T[] = []
  for (let i = 0; out.length < items.length; i++) {
    for (const b of buckets) {
      if (i < b.length) out.push(b[i])
    }
  }
  return out
}

/**
 * 집중 세션 — 한 (한자, 음독) 쌍을 쓰는 숙어의 읽기 카드만 모은다 (Phase 10).
 *
 * 리포트의 처방을 그 자리에서 실행하는 통로다. 재대결과 마찬가지로 **기한을 무시하고**
 * `selectSession` 을 타지 않는다 — 이 세션의 전부가 "이 음독을 반복해서 만나는 것"이라
 * 기한이나 모드 배분이 끼면 목적이 흐려진다.
 *
 * 재대결과 다른 점은 **아직 안 본 숙어도 넣는다**는 것이다. 처방이 "뚫으면 N개가 열린다"고
 * 말했으니 그 N 개를 실제로 열어야 말이 맞는다.
 *
 * 정렬 — 틀린 적 있는 것(교정) → 아직 안 본 것(새로 여는 것) → 맞히기만 한 것(확인).
 *
 * 기한을 무시하는 대가는 `buildRematch` 와 같다. 답안이 정규 이벤트로 남아 FSRS 일정에
 * 영향을 준다.
 */
export function buildFocus(
  pool: IdiomEntry[],
  events: LearningEvent[],
  options: FocusOptions,
): Session {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })

  const scored: { item: SessionItem; rank: number; wrong: number }[] = []
  for (const entry of pool) {
    if (!entry.pairIds.includes(options.pairId)) continue
    const card = state.cards.get(cardKey(entry.idiomId, 'reading'))
    const wrong = card?.wrong ?? 0
    const rank = wrong > 0 ? 0 : card === undefined ? 1 : 2
    scored.push({
      item: {
        idiomId: entry.idiomId,
        cardType: 'reading',
        mode: assignMode({
          category: entry.category,
          meaningKnown: state.meaningKnown.get(entry.idiomId),
          meaningCard: state.cards.get(cardKey(entry.idiomId, 'meaning'))?.card,
        }).mode,
        due: card !== undefined && card.card.due.getTime() <= options.now,
      },
      rank,
      wrong,
    })
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.wrong - a.wrong ||
      (a.item.idiomId < b.item.idiomId ? -1 : a.item.idiomId > b.item.idiomId ? 1 : 0),
  )

  // 대조는 자르기 *전에* 건다 — 뒤에 걸면 상위 N 개가 한쪽 표면형에 몰렸을 때 못 갈린다
  const ordered = options.surfaceOf
    ? interleaveBySurface(scored, (s) => options.surfaceOf!(s.item.idiomId))
    : scored

  // 집중 세션도 확인 질문을 안 끼운다 — 지금 물어야 할 건 뜻이 아니라 이 음독이다
  const cards: SessionCard[] = ordered
    .slice(0, options.limit)
    .map(({ item }) => ({ ...item, needsClassReview: false }))

  return { cards, state }
}
