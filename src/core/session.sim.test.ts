// 세션 100회를 돌려 학습 코어 전체(선택 → 채점 → 오답 판정 → 이벤트 → 재생)를 검증한다.
// Phase 4 완료 기준 — "UI 없이 테스트로 세션 시뮬레이션 통과" (PLAN §9)
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pairId, type KanjiReadings } from '../lib/onyomi.ts'
import { stripLongVowels, unvoiceAll } from '../lib/readings.ts'
import { buildKoSiblingIndex, type MistakeContext } from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import { activeCardTypes, assignMode } from './mode.ts'
import {
  buildSession,
  recordMeaningAnswer,
  recordMeaningKnown,
  recordReadingAnswer,
  type ClassSource,
  type IdiomEntry,
} from './session.ts'
import { mistakeTotals, replay, type ReplayState } from './replay.ts'
import { cardKey, type KoreanCategory, type LearningEvent } from './types.ts'
import type { Band } from '../lib/bands.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)
const SESSIONS = 100
const SESSION_LIMIT = 20

/** 재현 가능한 난수 (mulberry32). 시뮬레이션이 매번 같은 결과를 내야 회귀를 잡을 수 있다 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface PoolItem extends IdiomEntry {
  headword: string
  reading: string
}

/** 정답 읽기를 그럴듯하게 망가뜨린다 — 促音·連濁·長音 누락과 끝음절 탈락 */
function corrupt(reading: string, rand: () => number): string {
  const ops = [
    (s: string) => s.replace('っ', 'つ'),
    (s: string) => unvoiceAll(s),
    (s: string) => stripLongVowels(s),
    (s: string) => s.slice(0, -1),
  ]
  const start = Math.floor(rand() * ops.length)
  for (let i = 0; i < ops.length; i++) {
    const out = ops[(start + i) % ops.length](reading)
    if (out !== reading && out !== '') return out
  }
  return reading + 'う'
}

interface SimResult {
  events: LearningEvent[]
  sessions: number
  /** 아직 낼 카드가 남아 있는데도 비어 나온 세션 수. 0 이 아니면 선택 로직이 막힌 것이다 */
  emptyWithWork: number
  /** 낼 게 정말 없어서 비어 나온 세션 수. 작은 풀에서는 정상이다 */
  emptyIdle: number
  dueCards: number
  maxSessionSize: number
  /** 카드 풀 진입 시점에 한국어 분류 확인을 요구한 횟수 (Phase 3 지연 검수) */
  classReviews: number
  state: ReplayState
}

/**
 * 하루 한 세션씩 SESSIONS 회. 매 세션마다 이벤트 로그를 처음부터 재생해 상태를 만들고,
 * 그 상태로 다음 세션을 고른다 — 실제 앱과 같은 경로다.
 */
function simulate(pool: PoolItem[], mistakes: MistakeContext, seed: number): SimResult {
  const rand = rng(seed)
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const events: LearningEvent[] = []
  /** 숙어별 습득도. 맞힐 때마다 오르고 틀리면 떨어진다 */
  const skill = new Map<string, number>()

  let emptyWithWork = 0
  let emptyIdle = 0
  let dueCards = 0
  let classReviews = 0
  let maxSessionSize = 0

  for (let s = 0; s < SESSIONS; s++) {
    const now = T0 + s * DAY
    const { cards, state } = buildSession(pool, events, { now, limit: SESSION_LIMIT })

    if (cards.length === 0) {
      // 빈 세션이 정당하려면 밴드 범위 안에 미도입 카드가 없고 기한이 지난 카드도 없어야 한다.
      // buildSession 을 다시 부르지 않고 상태만 보고 독립적으로 확인한다
      const workLeft = pool.some((p) => {
        const mode = assignMode({
          category: p.category,
          meaningKnown: state.meaningKnown.get(p.idiomId),
          meaningCard: state.cards.get(cardKey(p.idiomId, 'meaning'))?.card,
        }).mode
        return activeCardTypes(mode).some((t) => {
          const st = state.cards.get(cardKey(p.idiomId, t))
          if (st === undefined) return p.band >= 1
          return st.card.due.getTime() <= now
        })
      })
      if (workLeft) emptyWithWork++
      else emptyIdle++
    }
    maxSessionSize = Math.max(maxSessionSize, cards.length)

    const seen = new Set<string>()
    cards.forEach((item, i) => {
      const key = cardKey(item.idiomId, item.cardType)
      expect(seen.has(key), `세션 ${s} 에 ${key} 가 중복 출제됐다`).toBe(false)
      seen.add(key)
      if (item.due) dueCards++

      const entry = byId.get(item.idiomId)!
      const at = now + i * 12_000
      const ctx = { userId: 'local', deviceId: 'sim', at, elapsedMs: 800 + Math.floor(rand() * 4000), rand }

      // 지연 검수 — 카드 풀 진입 시점에 분류 확인을 먼저 받는다 (Phase 3 에서 미뤄둔 몫)
      if (item.needsClassReview) {
        classReviews++
        events.push(recordMeaningKnown({
          idiomId: entry.idiomId,
          known: entry.category === 1,
          ctx: { ...ctx, at: at - 1 },
        }))
      }

      const level = skill.get(key) ?? 0
      const correct = rand() < 0.35 + 0.2 * level
      skill.set(key, correct ? Math.min(level + 1, 3) : Math.max(level - 1, 0))
      const confidence = rand() < 0.15 ? ('hard' as const) : null

      events.push(
        item.cardType === 'reading'
          ? recordReadingAnswer({
              item,
              headword: entry.headword,
              reading: entry.reading,
              answer: correct ? entry.reading : corrupt(entry.reading, rand),
              confidence,
              ctx,
              mistakes,
            })
          : recordMeaningAnswer({ item, correct, confidence, ctx }),
      )
    })
  }

  return {
    events,
    sessions: SESSIONS,
    emptyWithWork,
    emptyIdle,
    dueCards,
    classReviews,
    maxSessionSize,
    state: replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] }),
  }
}

function checkInvariants(result: SimResult, pool: PoolItem[]): void {
  expect(result.emptyWithWork, '낼 카드가 남았는데 빈 세션이 나왔다 — 선택 로직이 막혔다').toBe(0)
  expect(result.maxSessionSize).toBeLessThanOrEqual(SESSION_LIMIT)
  expect(result.dueCards, '100회 동안 복습이 한 번도 안 걸렸다').toBeGreaterThan(0)

  // 재생은 결정론적이어야 한다
  const pairsOf = (id: string) => pool.find((p) => p.idiomId === id)?.pairIds ?? []
  expect(replay(result.events, { pairsOf })).toEqual(result.state)

  // 카드별 reps 는 그 카드에 쌓인 이벤트 수와 정확히 같다
  const counted = new Map<string, number>()
  for (const e of result.events) {
    if (e.type !== 'review') continue // meaningKnown 은 FSRS 카드를 건드리지 않는다
    const key = cardKey(e.idiomId, e.cardType)
    counted.set(key, (counted.get(key) ?? 0) + 1)
  }
  for (const [key, card] of result.state.cards) {
    expect(card.card.reps, `${key} 의 reps 가 이벤트 수와 어긋난다`).toBe(counted.get(key))
    expect(Number.isFinite(card.card.stability)).toBe(true)
    expect(card.card.stability).toBeGreaterThan(0)
    expect(card.card.due.getTime()).toBeGreaterThan(card.lastAt!)
  }

  // 지연 검수 — 미확정 분류를 가진 숙어에 대해서만, 숙어당 정확히 한 번 묻는다
  const asked = result.events.filter((e) => e.type === 'meaningKnown')
  expect(asked).toHaveLength(result.classReviews)
  expect(new Set(asked.map((e) => e.idiomId)).size, '같은 숙어에 두 번 물었다').toBe(asked.length)
  for (const e of asked) {
    const entry = pool.find((p) => p.idiomId === e.idiomId)!
    expect(entry.classSource, `${e.idiomId} 는 확정 분류인데 물었다`).not.toBe('manual')
  }

  // 음독 집계는 읽기 카드 이벤트 수를 넘을 수 없다
  for (const stat of result.state.onyomi.values()) {
    expect(stat.wrong).toBeLessThanOrEqual(stat.seen)
    expect(stat.seen).toBeGreaterThan(0)
  }
}

// ── 고정본 풀 (data/dict 없이도 항상 돈다) ──────────────────────────────────
const FIXTURE_POOL: PoolItem[] = [
  ['1', '発達', 'はったつ'], ['2', '学校', 'がっこう'], ['3', '心配', 'しんぱい'],
  ['4', '特徴', 'とくちょう'], ['5', '高校', 'こうこう'], ['6', '数字', 'すうじ'],
  ['7', '重箱', 'じゅうばこ'], ['8', '認識', 'にんしき'], ['9', '温度', 'おんど'],
  ['10', '想像', 'そうぞう'], ['11', '建築', 'けんちく'], ['12', '感謝', 'かんしゃ'],
  ['13', '三日月', 'みかづき'], ['14', '構成', 'こうせい'], ['15', '一体', 'いったい'],
  ['16', '人数', 'にんずう'], ['17', '支度', 'したく'], ['18', '大勢', 'おおぜい'],
  ['19', '荷物', 'にもつ'], ['20', '花火', 'はなび'], ['21', '場所', 'ばしょ'],
  ['22', '意識', 'いしき'], ['23', '発端', 'ほったん'], ['24', '湯桶', 'ゆとう'],
].map(([idiomId, headword, reading], i) => ({
  idiomId,
  headword,
  reading,
  band: ((i % 3) + 1) as Band,
  category: ((i % 3) + 1) as KoreanCategory,
  // manual 은 확정, llm·default 는 미확정이라 카드 풀 진입 시 확인을 요구한다
  classSource: (['manual', 'llm', 'default'] as const)[i % 3] as ClassSource,
  pairIds: [...headword].map((k) => pairId(k, 'x', 'on')),
}))

const fixtureCtx: MistakeContext = {
  lookup: (k) => KANJI_FIXTURE[k],
  koSiblingOnyomi: buildKoSiblingIndex(KANJI_FIXTURE),
}

describe(`세션 ${SESSIONS}회 시뮬레이션 (고정본 풀)`, () => {
  const result = simulate(FIXTURE_POOL, fixtureCtx, 20260904)

  it('예외 없이 완주한다', () => {
    expect(result.sessions).toBe(SESSIONS)
    expect(result.events.length).toBeGreaterThan(SESSIONS)
  })

  it('불변 조건을 모두 지킨다', () => {
    checkInvariants(result, FIXTURE_POOL)
  })

  it('오답 유형이 6종 안에서만 나온다', () => {
    const totals = mistakeTotals(result.state)
    expect(Object.keys(totals).length).toBeGreaterThan(0)
    for (const type of Object.keys(totals)) {
      expect([
        'ONYOMI_CHOICE', 'RENDAKU', 'SOKUON', 'CHOON', 'MIXED_READING', 'KO_INTERFERENCE',
      ]).toContain(type)
    }
  })

  it('미확정 분류 숙어가 카드 풀에 들어올 때 확인을 요구한다', () => {
    const unconfirmed = FIXTURE_POOL.filter((p) => p.classSource !== 'manual' && p.band >= 1)
    expect(result.classReviews).toBeGreaterThan(0)
    expect(result.classReviews).toBeLessThanOrEqual(unconfirmed.length)
  })

  it('같은 시드면 같은 이벤트 로그가 나온다', () => {
    const again = simulate(FIXTURE_POOL, fixtureCtx, 20260904)
    expect(again.events).toEqual(result.events)
  })
})

// ── 실제 사전 DB 풀 ────────────────────────────────────────────────────────
const DICT = join('data', 'dict')
const hasDict = ['idioms.json', 'kanji.json', 'bands.json', 'onyomi-map.json']
  .every((f) => existsSync(join(DICT, f)))

describe.runIf(hasDict)(`세션 ${SESSIONS}회 시뮬레이션 (실제 사전 DB)`, () => {
  function load() {
    const read = (f: string) => JSON.parse(readFileSync(join(DICT, f), 'utf8'))
    const kanji = read('kanji.json').kanji as Record<string, KanjiReadings & { koreanH: string[] }>
    const bands = read('bands.json').byId as Record<string, Band>
    const byIdiom = read('onyomi-map.json').byIdiom as
      Record<string, [string, string, string, 'on' | 'kun', string[]][]>
    const idioms = read('idioms.json').idioms as
      { id: string; headword: string; reading: string }[]
    const classPath = join(DICT, 'korean-class.json')
    const koClass = existsSync(classPath)
      ? (read('korean-class.json').byId as
          Record<string, { category: KoreanCategory; classSource: ClassSource }>)
      : {}

    const pool: PoolItem[] = []
    for (const it of idioms) {
      const band = bands[it.id]
      const segs = byIdiom[it.id]
      if (band === undefined || band < 1 || band > 2 || segs === undefined) continue
      pool.push({
        idiomId: it.id,
        headword: it.headword,
        reading: it.reading,
        band,
        category: koClass[it.id]?.category ?? 2,
        classSource: koClass[it.id]?.classSource ?? 'default',
        pairIds: segs.map(([k, , base, kind]) => pairId(k, base, kind)),
      })
      if (pool.length >= 400) break
    }
    return { pool, kanji }
  }

  const { pool, kanji } = load()
  const ctx: MistakeContext = {
    lookup: (k) => kanji[k],
    koSiblingOnyomi: buildKoSiblingIndex(kanji),
  }
  const result = simulate(pool, ctx, 20260904)

  it('실제 숙어 풀을 쓴다', () => {
    expect(pool.length).toBe(400)
  })

  it('예외 없이 완주하고 불변 조건을 지킨다', () => {
    checkInvariants(result, pool)
  })

  it('오답 유형이 여러 종류로 분포한다 — 진단 리포트의 입력이 된다', () => {
    const totals = mistakeTotals(result.state)
    expect(Object.keys(totals).length).toBeGreaterThanOrEqual(3)
  })
})
