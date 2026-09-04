// 세션에 낼 카드를 고른다 — 복습 기한 우선, 신규는 밴드와 미숙 음독 가중으로 (PLAN §6)
import type { Band } from '../lib/bands.ts'
import { activeCardTypes } from './mode.ts'
import { isDue } from './scheduler.ts'
import type { ReplayState } from './replay.ts'
import { cardKey, type CardType, type StudyMode } from './types.ts'

export interface SessionCandidate {
  idiomId: string
  band: Band
  mode: StudyMode
  /** 구성 (한자, 음독) 쌍 id. 미숙 음독 가중에 쓴다 */
  pairIds: string[]
}

export interface SessionItem {
  idiomId: string
  cardType: CardType
  mode: StudyMode
  /** 복습 기한이 지난 카드인지. false 면 신규 도입 */
  due: boolean
}

export interface SelectOptions {
  now: number
  /** 세션 길이 (카드 장수) */
  limit: number
  /** 모드별 배분. 기본 7:3 (PLAN §6) */
  ratio?: { correction: number; expansion: number }
  /** 신규 도입 밴드 범위. 기본은 밴드 0 건너뛰기 (PLAN §4) */
  minBand?: Band
  maxBand?: Band
}

const DEFAULT_RATIO = { correction: 7, expansion: 3 }

/** 아직 한 번도 안 나온 음독의 가중치. 확실히 미숙한 것(오답률 1)보다는 낮게 둔다 */
const UNSEEN_PAIR_WEIGHT = 0.5

/**
 * 미숙도 — 구성 음독의 오답률 평균. 높을수록 먼저 낸다.
 * 음독은 학습 대상이 아니라 출제 순서를 정하는 진단 지표다 (PLAN §6).
 */
export function weakness(pairIds: string[], state: ReplayState): number {
  if (pairIds.length === 0) return 0
  let sum = 0
  for (const id of pairIds) {
    const stat = state.onyomi.get(id)
    sum += stat === undefined || stat.seen === 0 ? UNSEEN_PAIR_WEIGHT : stat.wrong / stat.seen
  }
  return sum / pairIds.length
}

interface Slot extends SessionItem {
  /** due 면 기한 초과 ms, 신규면 0 */
  overdue: number
  band: Band
  weak: number
}

/**
 * 세션 구성.
 * 1. 모드별 정원을 비율로 나눈다
 * 2. 각 모드에서 기한이 지난 카드를 초과가 큰 순으로 먼저 채운다
 * 3. 남으면 신규를 밴드 오름차순 · 미숙 음독 가중 내림차순으로 채운다
 * 4. 한쪽 모드가 정원을 못 채우면 남은 자리를 다른 모드가 가져간다 (세션이 짧아지지 않게)
 *
 * 무작위를 쓰지 않는다. 같은 입력이면 같은 세션이 나와야 재현 가능한 진단이 된다.
 */
export function selectSession(
  candidates: SessionCandidate[],
  state: ReplayState,
  options: SelectOptions,
): SessionItem[] {
  const ratio = options.ratio ?? DEFAULT_RATIO
  const minBand = options.minBand ?? 1
  const maxBand = options.maxBand ?? 4

  const due: Record<StudyMode, Slot[]> = { correction: [], expansion: [] }
  const fresh: Record<StudyMode, Slot[]> = { correction: [], expansion: [] }

  for (const c of candidates) {
    for (const cardType of activeCardTypes(c.mode)) {
      const st = state.cards.get(cardKey(c.idiomId, cardType))
      if (st === undefined) {
        if (c.band < minBand || c.band > maxBand) continue
        fresh[c.mode].push({
          idiomId: c.idiomId, cardType, mode: c.mode, due: false,
          overdue: 0, band: c.band, weak: weakness(c.pairIds, state),
        })
      } else if (isDue(st.card, options.now)) {
        due[c.mode].push({
          idiomId: c.idiomId, cardType, mode: c.mode, due: true,
          overdue: options.now - st.card.due.getTime(), band: c.band,
          weak: weakness(c.pairIds, state),
        })
      }
    }
  }

  for (const mode of ['correction', 'expansion'] as const) {
    due[mode].sort(byOverdue)
    fresh[mode].sort(byIntroOrder)
  }

  const total = ratio.correction + ratio.expansion
  const quota: Record<StudyMode, number> = total === 0
    ? { correction: options.limit, expansion: 0 }
    : {
        correction: Math.round((options.limit * ratio.correction) / total),
        expansion: 0,
      }
  quota.expansion = options.limit - quota.correction

  const picked: SessionItem[] = []
  const take = (mode: StudyMode, n: number): number => {
    let left = n
    for (const pool of [due[mode], fresh[mode]]) {
      while (left > 0 && pool.length > 0) {
        const s = pool.shift()!
        picked.push({ idiomId: s.idiomId, cardType: s.cardType, mode: s.mode, due: s.due })
        left--
      }
    }
    return n - left // 실제로 채운 수
  }

  const filled = take('correction', quota.correction) + take('expansion', quota.expansion)
  let rest = options.limit - filled
  if (rest > 0) rest -= take('correction', rest)
  if (rest > 0) take('expansion', rest)
  return picked
}

function byOverdue(a: Slot, b: Slot): number {
  return b.overdue - a.overdue || cmp(a.idiomId, b.idiomId) || cmp(a.cardType, b.cardType)
}

/** 신규 도입 순서 — 쉬운 밴드부터, 같은 밴드면 미숙한 음독을 품은 숙어부터 */
function byIntroOrder(a: Slot, b: Slot): number {
  return a.band - b.band || b.weak - a.weak || cmp(a.idiomId, b.idiomId) || cmp(a.cardType, b.cardType)
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
