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
  /**
   * 음독 쌍이 하나도 없는 숙어 (浜辺 はまべ·荒木 あらき). `kunShare` 정원이 쓴다.
   * 안 주면 false — 훈독을 모르는 호출부는 예전과 똑같이 돈다
   */
  kun?: boolean
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
  /**
   * 담은 것 상한(`STAR_MAX_SHARE`)을 셀 기준 장수. 호출부가 소개 여유분을 얹어
   * `limit` 을 부풀려 부르므로(`useStudySession`), 그걸로 세면 상한이 같이 부푼다.
   * 안 주면 `limit` 으로 센다
   */
  questionLimit?: number
  /**
   * 주면 뽑은 카드의 *제시 순서*를 이 시드로 섞는다 (숙어 단위 — 읽기·뜻은 붙어 이동).
   * *어떤* 카드를 뽑을지는 안 바뀐다(진단 가치 유지). 실제 세션은 매번 다른 시드를 준다.
   * 안 주면 우선순위 순서 그대로 — 테스트·시뮬레이션의 결정론을 유지한다 (2026-09-07).
   */
  seed?: number
  /**
   * 세션에서 훈독 숙어가 차지할 몫 (0~1, 기본 0). 설정의 레인지가 준다 (2026-09-22).
   *
   * **후보 풀에 섞는 것으로는 이 비율이 안 나온다.** `byIntroOrder` 가 밴드 다음으로
   * 미숙 음독 가중(`weak`)을 보는데 훈독 숙어는 음독 쌍이 없어 늘 바닥이라 줄 맨 뒤로
   * 밀린다 — 풀의 8.9% 를 넣어도 출제는 1% 였다 (200장 실측). 그래서 **정원으로 떼어낸다.**
   *
   * 1 이면 훈독만 낸다. 정원을 못 채우면 남은 자리는 반대쪽이 가져간다
   */
  kunShare?: number
}

/** mulberry32 — diagnostic.ts 와 같은 계열의 재현 가능한 난수 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * 숙어 단위로 섞는다 — 같은 숙어의 [읽기, 뜻] 카드는 붙어서 함께 이동하고 내부 순서는 유지.
 * 우선순위(due 먼저 등)는 흐트러지지만, 진단은 "어떤 카드"가 나오냐로 하지 순서로 안 한다.
 *
 * **담은 것만은 앞자리를 지킨다** (2026-09-21). 호출부가 소개 여유분을 얹어 더 만든 뒤
 * `planIntros` 가 앞에서부터 세어 자르기 때문에, 섞어서 뒤로 밀리면 담은 카드가 통째로
 * 잘려 나간다 — 「다음 세션에 나와요」가 거짓이 된다. 앞자리 안에서는 그대로 섞는다.
 */
function shuffleByIdiom(items: SessionItem[], seed: number, starred: Set<string>): SessionItem[] {
  const groups: SessionItem[][] = []
  const idx = new Map<string, number>()
  for (const it of items) {
    const g = idx.get(it.idiomId)
    if (g === undefined) {
      idx.set(it.idiomId, groups.length)
      groups.push([it])
    } else {
      groups[g].push(it)
    }
  }
  const rand = rng(seed)
  const shuffle = (g: SessionItem[][]): SessionItem[][] => {
    for (let i = g.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[g[i], g[j]] = [g[j], g[i]]
    }
    return g
  }
  const head = groups.filter((g) => starred.has(g[0].idiomId))
  const rest = groups.filter((g) => !starred.has(g[0].idiomId))
  return [...shuffle(head), ...shuffle(rest)].flat()
}

const DEFAULT_RATIO = { correction: 7, expansion: 3 }

/**
 * 담아 둔 표현이 한 세션에서 차지할 수 있는 최대 비율 (2026-09-21).
 * 담은 것은 기한이 지난 카드보다도 먼저 내는데, 상한이 없으면 열 개를 담은 날 세션이
 * 통째로 신규 도입이 되어 복습이 밀린다. 남은 것은 다음 세션으로 넘어간다.
 */
export const STAR_MAX_SHARE = 1 / 3

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
  /** 음독 쌍이 없는 숙어인가. 어느 갈래 정원에 넣을지 가른다 */
  kun: boolean
}

/** 한 갈래(음독 / 훈독)의 대기열. 모드별로 기한 지난 것과 신규를 따로 쌓는다 */
interface Group {
  due: Record<StudyMode, Slot[]>
  fresh: Record<StudyMode, Slot[]>
}
const emptyGroup = (): Group => ({
  due: { correction: [], expansion: [] },
  fresh: { correction: [], expansion: [] },
})

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

  /** 음독·혼독 / 훈독을 따로 쌓는다 — 정원을 갈래별로 떼려면 대기열도 갈라야 한다 */
  const on = emptyGroup()
  const kunG = emptyGroup()
  const groupOf = (kun: boolean) => (kun ? kunG : on)
  /**
   * 담아 둔 표현 중 **아직 카드가 없는 것** (2026-09-21). 모드를 안 가르고 한 줄로 모은다 —
   * 사용자가 직접 지목한 것이라 7:3 배분의 대상이 아니다.
   * 이미 카드가 있으면 여기 안 들어온다. 별이 하는 일은 신규 도입 우선권까지고,
   * 한 번 나온 뒤로는 FSRS 가 이어받는다
   */
  const starred: Slot[] = []

  for (const c of candidates) {
    const kun = c.kun ?? false
    for (const cardType of activeCardTypes(c.mode)) {
      const st = state.cards.get(cardKey(c.idiomId, cardType))
      if (st === undefined) {
        // 담은 것은 밴드 제한을 면제한다 — 안 그러면 밴드 0(3,976개)은 담아도 안 나온다
        const star = state.starred.has(c.idiomId)
        if (!star && (c.band < minBand || c.band > maxBand)) continue
        const slot = {
          idiomId: c.idiomId, cardType, mode: c.mode, due: false,
          overdue: 0, band: c.band, weak: weakness(c.pairIds, state), kun,
        }
        if (star) starred.push(slot)
        else groupOf(kun).fresh[c.mode].push(slot)
      } else if (isDue(st.card, options.now)) {
        groupOf(kun).due[c.mode].push({
          idiomId: c.idiomId, cardType, mode: c.mode, due: true,
          overdue: options.now - st.card.due.getTime(), band: c.band,
          weak: weakness(c.pairIds, state), kun,
        })
      }
    }
  }

  starred.sort(byIntroOrder)

  const picked: SessionItem[] = []
  // 담은 것을 **기한이 지난 카드보다도 먼저** 낸다 — 사용자가 직접 지목한 것은 며칠 밀린
  // 복습보다 강한 신호다. 대신 정원의 1/3 로 묶어 복습이 통째로 밀리지 않게 한다.
  // 한 장은 보장한다 — 짧은 세션에서 상한이 0 이 되면 「다음 세션에 나와요」가 거짓이 된다
  const starQuota = Math.max(
    1,
    Math.floor((options.questionLimit ?? options.limit) * STAR_MAX_SHARE),
  )
  for (const slot of starred.slice(0, starQuota)) {
    picked.push({ idiomId: slot.idiomId, cardType: slot.cardType, mode: slot.mode, due: slot.due })
  }
  // 상한을 넘은 것은 **평범한 신규로 되돌린다** — 담았다고 나올 기회가 줄면 안 된다.
  // 밴드 면제는 여기서 끝난다: 밴드 밖이면 원래 나올 카드가 아니었으므로 다음 세션을 기다린다
  for (const slot of starred.slice(starQuota)) {
    if (slot.band >= minBand && slot.band <= maxBand) groupOf(slot.kun).fresh[slot.mode].push(slot)
  }

  for (const g of [on, kunG]) {
    for (const mode of ['correction', 'expansion'] as const) {
      g.due[mode].sort(byOverdue)
      g.fresh[mode].sort(byIntroOrder)
    }
  }

  // 남은 자리를 기존 규칙대로 채운다 — 정원은 **남은 수**로 다시 나눈다
  const room = options.limit - picked.length
  const total = ratio.correction + ratio.expansion

  const take = (g: Group, mode: StudyMode, n: number): number => {
    let left = n
    for (const pool of [g.due[mode], g.fresh[mode]]) {
      while (left > 0 && pool.length > 0) {
        const s = pool.shift()!
        picked.push({ idiomId: s.idiomId, cardType: s.cardType, mode: s.mode, due: s.due })
        left--
      }
    }
    return n - left // 실제로 채운 수
  }

  /** 한 갈래에서 n 장을 교정:확장 비율대로 채우고, 실제로 채운 수를 돌려준다 */
  const fill = (g: Group, n: number): number => {
    if (n <= 0) return 0
    const corr = total === 0 ? n : Math.round((n * ratio.correction) / total)
    let placed = take(g, 'correction', corr) + take(g, 'expansion', n - corr)
    // 한쪽 모드가 정원을 못 채우면 남은 자리를 다른 모드가 가져간다 (세션이 짧아지지 않게)
    let rest = n - placed
    if (rest > 0) {
      const got = take(g, 'correction', rest)
      placed += got
      rest -= got
    }
    if (rest > 0) placed += take(g, 'expansion', rest)
    return placed
  }

  // 훈독 몫을 **먼저** 뗀다. 후보 풀에 섞는 것으로는 이 비율이 안 나온다 (`kunShare` 주석)
  const kunShare = Math.min(1, Math.max(0, options.kunShare ?? 0))
  const kunPlaced = fill(kunG, Math.round(room * kunShare))
  const onPlaced = fill(on, room - kunPlaced)
  // 음독 쪽이 모자라면 남은 자리를 훈독이 마저 가져간다 (그 반대는 위 줄이 이미 처리했다)
  fill(kunG, room - kunPlaced - onPlaced)

  return options.seed === undefined
    ? picked
    : shuffleByIdiom(picked, options.seed, state.starred)
}

/** 같은 숙어면 읽기 카드가 뜻 카드보다 먼저다 — 뜻 카드는 읽기를 보여주므로,
    읽기를 먼저 안 물으면 답이 새 버린다 (2026-09-06) */
const CARD_ORDER: Record<CardType, number> = { reading: 0, meaning: 1 }

function byOverdue(a: Slot, b: Slot): number {
  return (
    b.overdue - a.overdue ||
    cmp(a.idiomId, b.idiomId) ||
    CARD_ORDER[a.cardType] - CARD_ORDER[b.cardType]
  )
}

/** 신규 도입 순서 — 쉬운 밴드부터, 같은 밴드면 미숙한 음독을 품은 숙어부터,
    같은 숙어면 읽기 → 뜻 순 */
function byIntroOrder(a: Slot, b: Slot): number {
  return (
    a.band - b.band ||
    b.weak - a.weak ||
    cmp(a.idiomId, b.idiomId) ||
    CARD_ORDER[a.cardType] - CARD_ORDER[b.cardType]
  )
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
