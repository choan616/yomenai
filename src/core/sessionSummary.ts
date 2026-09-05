// 세션 종료 요약 — 리포트의 축소판과 "오늘의 발견" 한 줄.
// 진단 리포트가 이 앱의 얼굴이라면 매 세션 끝에 그 얼굴을 봐야 한다 (PLAN §7)
import type { OnyomiPair } from '../dict/load.ts'
import { replay } from './replay.ts'
import { compareEvents, type LearningEvent, type MistakeType, type ReviewEvent } from './types.ts'

/** 이 간격 이상 벌어지면 다른 세션으로 본다. 이벤트 로그에 세션 경계가 따로 없어서 시간으로 자른다 */
export const SESSION_GAP_MS = 30 * 60_000
/** 추이에 싣는 최근 세션 수 */
export const TREND_SESSIONS = 7
/** 추이를 "줄고 있다"고 말하려면 최소 이만큼의 세션이 필요하다 */
export const TREND_MIN_SESSIONS = 3

/**
 * 세션 하나에서 뽑은 관찰 한 조각.
 * 이벤트 로그가 append-only 라 과거 재계산이 공짜다 — 그 위에서 매번 새로 뽑는다.
 */
export type Finding =
  | { kind: 'CLEAN_RUN'; total: number }
  | { kind: 'MISTAKE_TREND'; type: MistakeType; direction: 'down' | 'up'; sessions: number }
  | { kind: 'KO_INTERFERENCE'; count: number; headword: string; reading: string }
  | { kind: 'ONYOMI_UNLOCKED'; kanji: string; base: string; onKind: 'on' | 'kun'; unlocks: number }
  | { kind: 'WEAK_ONYOMI'; kanji: string; base: string; wrong: number; seen: number }

export interface SessionSummary {
  total: number
  correct: number
  /** 이번 세션에 *처음* 맞힌 (한자, 음독) 쌍 수 */
  newPairs: number
  /** 이번 세션 최다 오답 유형 */
  topMistake: { type: MistakeType; count: number } | null
  /** `topMistake` 유형의 세션별 발생 수 (오래된 → 최신, 이번 세션 포함) */
  trend: number[]
  finding: Finding | null
}

export interface SummaryInput {
  /** 이번 세션 이전의 이벤트 전부 */
  prior: LearningEvent[]
  /** 이번 세션 이벤트 */
  session: LearningEvent[]
  pairsOf: (idiomId: string) => string[]
  pairs: Map<string, OnyomiPair>
  nameOf: (idiomId: string) => { headword: string; reading: string } | undefined
  /** 그 음독을 쓰는 숙어 수 — "이걸 뚫으면 N개가 열린다"의 N */
  unlocksOf: (pairId: string) => number
}

/** 시간 간격으로 이벤트를 세션 단위로 자른다 */
export function groupSessions(events: LearningEvent[]): LearningEvent[][] {
  const ordered = events.filter((e) => e.deletedAt === null).sort(compareEvents)
  const out: LearningEvent[][] = []
  let cur: LearningEvent[] = []
  let last = 0
  for (const e of ordered) {
    if (cur.length > 0 && e.at - last > SESSION_GAP_MS) {
      out.push(cur)
      cur = []
    }
    cur.push(e)
    last = e.at
  }
  if (cur.length > 0) out.push(cur)
  return out
}

export function buildSessionSummary(input: SummaryInput): SessionSummary {
  const reviews = input.session.filter(
    (e): e is ReviewEvent => e.type === 'review' && e.deletedAt === null,
  )
  const total = reviews.length
  const correct = reviews.filter((e) => e.correct).length

  const topMistake = topMistakeOf(reviews)
  const all = [...input.prior, ...input.session]
  const trend = topMistake ? trendOf(all, topMistake.type) : []
  const newPairs = newlyCorrectPairs(input)

  return {
    total,
    correct,
    newPairs: newPairs.length,
    topMistake,
    trend,
    finding: pickFinding({ input, reviews, total, correct, topMistake, trend, newPairs }),
  }
}

function topMistakeOf(reviews: ReviewEvent[]): { type: MistakeType; count: number } | null {
  const counts = new Map<MistakeType, number>()
  for (const e of reviews) {
    if (e.mistakeType === null) continue
    counts.set(e.mistakeType, (counts.get(e.mistakeType) ?? 0) + 1)
  }
  let best: { type: MistakeType; count: number } | null = null
  for (const [type, count] of counts) {
    if (best === null || count > best.count || (count === best.count && type < best.type)) {
      best = { type, count }
    }
  }
  return best
}

/** 최근 세션들에서 그 오답 유형이 몇 번 났는지 */
function trendOf(all: LearningEvent[], type: MistakeType): number[] {
  return groupSessions(all)
    .slice(-TREND_SESSIONS)
    .map((g) => g.filter((e) => e.type === 'review' && e.mistakeType === type).length)
}

/**
 * 이번 세션에 처음 정답을 낸 음독 쌍.
 * 이전 로그와 전체 로그를 각각 재생해 "정답 0회 → 1회 이상"으로 바뀐 쌍을 찾는다.
 */
function newlyCorrectPairs(input: SummaryInput): string[] {
  const opts = { pairsOf: input.pairsOf }
  const before = replay(input.prior, opts).onyomi
  const after = replay([...input.prior, ...input.session], opts).onyomi
  const out: string[] = []
  for (const [pairId, a] of after) {
    const b = before.get(pairId)
    const hadCorrect = b !== undefined && b.seen - b.wrong > 0
    if (!hadCorrect && a.seen - a.wrong > 0) out.push(pairId)
  }
  return out.sort()
}

/** 최근 구간이 한 방향으로만 움직였는지 */
function trendDirection(trend: number[]): 'down' | 'up' | null {
  if (trend.length < TREND_MIN_SESSIONS) return null
  const tail = trend.slice(-TREND_MIN_SESSIONS)
  const first = tail[0]
  const last = tail[tail.length - 1]
  const monotone = (cmp: (a: number, b: number) => boolean) =>
    tail.every((v, i) => i === 0 || cmp(v, tail[i - 1]))
  if (first > last && monotone((v, p) => v <= p)) return 'down'
  if (first < last && monotone((v, p) => v >= p)) return 'up'
  return null
}

/** 이번 세션 오답에 걸린 음독 중 가장 많이 틀린 것 */
function weakestPair(
  input: SummaryInput,
  reviews: ReviewEvent[],
): { pairId: string; wrong: number; seen: number } | null {
  const wrong = new Map<string, number>()
  const seen = new Map<string, number>()
  for (const e of reviews) {
    if (e.cardType !== 'reading') continue
    for (const p of input.pairsOf(e.idiomId)) {
      seen.set(p, (seen.get(p) ?? 0) + 1)
      if (!e.correct) wrong.set(p, (wrong.get(p) ?? 0) + 1)
    }
  }
  let best: { pairId: string; wrong: number; seen: number } | null = null
  for (const [pairId, n] of wrong) {
    if (best === null || n > best.wrong || (n === best.wrong && pairId < best.pairId)) {
      best = { pairId, wrong: n, seen: seen.get(pairId) ?? n }
    }
  }
  return best
}

/**
 * 관찰 하나를 고른다. 여러 개를 늘어놓으면 대시보드가 되고 읽히지 않는다.
 *
 * 우선순위는 "드물수록, 그리고 이 앱만 할 수 있는 말일수록 앞"이다.
 * 전부 정답 → 좋아지는 추이 → 한국음 간섭(이 앱의 진단축) → 새로 뚫은 음독 →
 * 나빠지는 추이 → 이번 세션 취약 음독.
 */
function pickFinding(a: {
  input: SummaryInput
  reviews: ReviewEvent[]
  total: number
  correct: number
  topMistake: { type: MistakeType; count: number } | null
  trend: number[]
  newPairs: string[]
}): Finding | null {
  if (a.total > 0 && a.correct === a.total) return { kind: 'CLEAN_RUN', total: a.total }

  const dir = trendDirection(a.trend)
  const sessions = Math.min(a.trend.length, TREND_SESSIONS)
  if (dir === 'down' && a.topMistake) {
    return { kind: 'MISTAKE_TREND', type: a.topMistake.type, direction: 'down', sessions }
  }

  const ko = a.reviews.filter((e) => e.mistakeType === 'KO_INTERFERENCE')
  if (ko.length > 0) {
    const n = a.input.nameOf(ko[0].idiomId)
    if (n) {
      return { kind: 'KO_INTERFERENCE', count: ko.length, headword: n.headword, reading: n.reading }
    }
  }

  if (a.newPairs.length > 0) {
    const best = a.newPairs.reduce((x, y) =>
      a.input.unlocksOf(y) > a.input.unlocksOf(x) ? y : x,
    )
    const p = a.input.pairs.get(best)
    if (p) {
      return {
        kind: 'ONYOMI_UNLOCKED',
        kanji: p.kanji,
        base: p.base,
        onKind: p.kind,
        unlocks: a.input.unlocksOf(best),
      }
    }
  }

  if (dir === 'up' && a.topMistake) {
    return { kind: 'MISTAKE_TREND', type: a.topMistake.type, direction: 'up', sessions }
  }

  const weak = weakestPair(a.input, a.reviews)
  if (weak) {
    const p = a.input.pairs.get(weak.pairId)
    if (p) {
      return { kind: 'WEAK_ONYOMI', kanji: p.kanji, base: p.base, wrong: weak.wrong, seen: weak.seen }
    }
  }
  return null
}
