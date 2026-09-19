// 수준 사다리 두 안이 실제 실력을 얼마나 맞히는지 시뮬레이션으로 잰다.
// 실제 로그로는 "정말 익혔는지"를 알 수 없어서, 학습자를 시뮬레이터 안에서 만들고 그 내부 상태를
// 정답지로 쓴다 (context-notes 2026-09-19 절).
//   A 지금 것  — 밴드별 최근 30회 정답률 (buildLevel)
//   B 재고     — 밴드별 isStable 통과 숙어 개수 / 만난 숙어 수
//   C 숙어 창  — 숙어당 최근 1건만 남긴 최근 30숙어 정답률
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pairId, type KanjiReadings } from '../src/lib/onyomi.ts'
import { buildKoSiblingIndex, type MistakeContext } from '../src/core/mistakes.ts'
import {
  buildSession,
  recordMeaningAnswer,
  recordMeaningKnown,
  recordReadingAnswer,
  type ClassSource,
  type IdiomEntry,
} from '../src/core/session.ts'
import { replay } from '../src/core/replay.ts'
import { State } from 'ts-fsrs'
 import { isStable, MEANING_STABLE_DAYS } from '../src/core/scheduler.ts'
import { buildLevel, LEVEL_SOLID_RATE, LEVEL_WINDOW } from '../src/core/level.ts'
import { cardKey, compareEvents, type KoreanCategory, type LearningEvent } from '../src/core/types.ts'
import type { Band } from '../src/lib/bands.ts'
import { writeTsvBom } from './lib/tsv.ts'
import { DICT_DIR } from './lib/dict.ts'

const DAY = 86_400_000
const T0 = Date.UTC(2026, 0, 1)
const SESSION_LIMIT = 20
const BANDS: Band[] = [1, 2, 3]

/** 학습자 모델 — 전부 가정이다. 결론이 이 값들에 휘둘리는지 보려고 조합을 바꿔 돌린다 */
interface Learner {
  /** 안 익힌 숙어를 세션에서 만나면 익힐 확률 (답을 보니까 배운다) */
  learn: number
  /** 익힌 숙어를 맞힐 확률 (오타 제외) */
  known: number
  /** 안 익힌 숙어를 한국 한자음으로 유추해 맞힐 확률 — 밴드가 높을수록 낮다 */
  guess: Record<Band, number>
  /** 익힌 숙어를 안 보고 지나간 하루당 잊을 확률 */
  forgetPerDay: number
  /** 아는데 손이 미끄러질 확률 */
  typo: number
}

interface PoolItem extends IdiomEntry {
  headword: string
  reading: string
}

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 정답 읽기를 그럴듯하게 망가뜨린다 (session.sim.test.ts 와 같은 방식) */
function corrupt(reading: string, rand: () => number): string {
  const ops = [
    (s: string) => s.replace('っ', 'つ'),
    (s: string) =>
      s.replace(/[がぎぐげござじずぜぞだぢづでどばびぶべぼ]/, (c) =>
        String.fromCodePoint(c.codePointAt(0)! - 1),
      ),
    (s: string) => s.replace('う', ''),
    (s: string) => s.slice(0, -1),
  ]
  const start = Math.floor(rand() * ops.length)
  for (let i = 0; i < ops.length; i++) {
    const out = ops[(start + i) % ops.length](reading)
    if (out !== reading && out !== '') return out
  }
  return reading + 'う'
}

type KanjiRow = KanjiReadings & { koreanH: string[] }

function loadPool(perBand: number): { pool: PoolItem[]; kanji: Record<string, KanjiRow> } {
  const read = (f: string) => JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8'))
  const kanji = read('kanji.json').kanji as Record<string, KanjiRow>
  const bands = read('bands.json').byId as Record<string, Band>
  const byIdiom = read('onyomi-map.json').byIdiom as Record<
    string,
    [string, string, string, 'on' | 'kun', string[]][]
  >
  const idioms = read('idioms.json').idioms as { id: string; headword: string; reading: string }[]
  const classPath = join(DICT_DIR, 'korean-class.json')
  const koClass = existsSync(classPath)
    ? (read('korean-class.json').byId as Record<
        string,
        { category: KoreanCategory; classSource: ClassSource }
      >)
    : {}

  const count: Record<number, number> = { 1: 0, 2: 0, 3: 0 }
  const pool: PoolItem[] = []
  for (const it of idioms) {
    const band = bands[it.id]
    const segs = byIdiom[it.id]
    if (band === undefined || !BANDS.includes(band) || segs === undefined) continue
    if (count[band] >= perBand) continue
    count[band]++
    pool.push({
      idiomId: it.id,
      headword: it.headword,
      reading: it.reading,
      band,
      category: koClass[it.id]?.category ?? 2,
      classSource: koClass[it.id]?.classSource ?? 'default',
      pairIds: segs.map(([k, , base, kind]) => pairId(k, base, kind)),
    })
    if (BANDS.every((b) => count[b] >= perBand)) break
  }
  return { pool, kanji }
}

interface Snapshot {
  session: number
  band: Band
  /** 정답지 ① 수준 — 그 밴드에서 만난 숙어 중 정말 익힌 비율 */
  truthRate: number
  truthLearned: number
  /**
   * 정답지 ② 기대 정답률 — 만난 숙어를 지금 전부 한 번씩 낸다면 나올 정답률.
   * A 는 정답률이라 ①과 단위가 다르다 (모르는 단어도 찍어서 맞는다). 편향을 보려면 이쪽과 대야 한다
   */
  truthAccuracy: number
  introduced: number
  /** A 지금 사다리 */
  rateA: number
  seenA: number
  /** B 재고 사다리 */
  stableB: number
  rateB: number
  /** C 숙어 창 */
  rateC: number
  /** A 의 창 안 서로 다른 숙어 수 */
  windowIdioms: number
  /** A 의 창에서 아직 안 익힌 숙어가 차지한 비율 */
  windowUnlearnedShare: number
}

/** 한 시점에서 사다리 셋과 정답지를 같이 잰다 */
function measure(
  session: number,
  pool: PoolItem[],
  events: LearningEvent[],
  learned: Set<string>,
  bandOf: (id: string) => Band | undefined,
  learner: Learner,
  stableDays: number,
): Snapshot[] {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const state = replay(events, { pairsOf: (id) => byId.get(id)?.pairIds ?? [] })
  const level = buildLevel(events, bandOf)

  // 밴드별 읽기 이력 — 숙어 창(C)과 창 구성 확인에 쓴다
  const history = new Map<Band, { idiomId: string; correct: boolean }[]>()
  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined) continue
    const row = history.get(band)
    if (row) row.push({ idiomId: e.idiomId, correct: e.correct })
    else history.set(band, [{ idiomId: e.idiomId, correct: e.correct }])
  }

  return BANDS.map((band) => {
    const introducedIds = pool
      .filter((p) => p.band === band && state.cards.has(cardKey(p.idiomId, 'reading')))
      .map((p) => p.idiomId)
    const truthLearned = introducedIds.filter((id) => learned.has(id)).length
    const pOf = (id: string) =>
      learned.has(id) ? learner.known * (1 - learner.typo) : learner.guess[band]
    const truthAccuracy = introducedIds.length
      ? introducedIds.reduce((a, id) => a + pOf(id), 0) / introducedIds.length
      : 0
    const stableB = introducedIds.filter((id) => {
      const st = state.cards.get(cardKey(id, 'reading'))
      if (st === undefined) return false
      // 문턱을 바꿔 가며 재려고 isStable 을 그대로 안 쓰고 같은 조건을 편다
      return stableDays === MEANING_STABLE_DAYS
        ? isStable(st.card)
        : st.card.state === State.Review && st.card.stability >= stableDays
    }).length

    const rows = history.get(band) ?? []
    const win = rows.slice(-LEVEL_WINDOW)
    const distinct = new Set(win.map((r) => r.idiomId))
    const unlearnedInWin = win.filter((r) => !learned.has(r.idiomId)).length

    // C — 숙어당 최근 1건만 남기고 최근 갱신 30숙어
    const latest = new Map<string, boolean>()
    for (const r of rows) {
      latest.delete(r.idiomId)
      latest.set(r.idiomId, r.correct)
    }
    const lastN = [...latest.values()].slice(-LEVEL_WINDOW)

    const a = level.bands.find((b) => b.band === band)
    return {
      session,
      band,
      truthRate: introducedIds.length ? truthLearned / introducedIds.length : 0,
      truthLearned,
      truthAccuracy,
      introduced: introducedIds.length,
      rateA: a?.rate ?? 0,
      seenA: a?.seen ?? 0,
      stableB,
      rateB: introducedIds.length ? stableB / introducedIds.length : 0,
      rateC: lastN.length ? lastN.filter(Boolean).length / lastN.length : 0,
      windowIdioms: distinct.size,
      windowUnlearnedShare: win.length ? unlearnedInWin / win.length : 0,
    }
  })
}

function run(
  pool: PoolItem[],
  ctx: MistakeContext,
  learner: Learner,
  sessions: number,
  seed: number,
  stableDays: number,
): Snapshot[] {
  const rand = rng(seed)
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const bandOf = (id: string) => byId.get(id)?.band
  const events: LearningEvent[] = []
  /** 정답지 — 이 숙어를 익혔나 */
  const learned = new Set<string>()
  const lastSeenDay = new Map<string, number>()
  const snaps: Snapshot[] = []

  for (let s = 0; s < sessions; s++) {
    const now = T0 + s * DAY
    const { cards } = buildSession(pool, events, { now, limit: SESSION_LIMIT })

    // 망각 — 안 본 날수만큼 잊을 기회를 준다
    for (const id of [...learned]) {
      const gap = s - (lastSeenDay.get(id) ?? s)
      if (gap > 0 && rand() < 1 - (1 - learner.forgetPerDay) ** gap) learned.delete(id)
    }

    cards.forEach((item, i) => {
      const entry = byId.get(item.idiomId)!
      const at = now + i * 12_000
      const c = { userId: 'local', deviceId: 'sim', at, elapsedMs: 1500, rand }
      if (item.needsClassReview) {
        events.push(
          recordMeaningKnown({
            idiomId: entry.idiomId,
            known: entry.category === 1,
            ctx: { ...c, at: at - 1 },
          }),
        )
      }
      if (item.cardType === 'meaning') {
        events.push(recordMeaningAnswer({ item, correct: rand() < 0.8, confidence: null, ctx: c }))
        return
      }
      const knows = learned.has(entry.idiomId)
      const p = knows ? learner.known * (1 - learner.typo) : learner.guess[entry.band]
      const correct = rand() < p
      events.push(
        recordReadingAnswer({
          item,
          headword: entry.headword,
          reading: entry.reading,
          answer: correct ? entry.reading : corrupt(entry.reading, rand),
          confidence: null,
          ctx: c,
          mistakes: ctx,
        }),
      )
      // 답을 보니 배운다. 이미 익혔으면 유지된다
      if (!knows && rand() < learner.learn) learned.add(entry.idiomId)
      lastSeenDay.set(entry.idiomId, s)
    })

    snaps.push(...measure(s, pool, events, learned, bandOf, learner, stableDays))
  }
  return snaps
}

/**
 * 억울한 뒤집힘 — 익힌 숙어가 줄지 않았는데 판정이 안정 → 흔들림으로 내려간 횟수.
 * 사용자가 "거슬린다"고 한 것이 이것이라 계량 기준도 이걸로 맞춘다
 */
function flips(snaps: Snapshot[], rateOf: (s: Snapshot) => number, minSeen = 5): number {
  let n = 0
  for (const band of BANDS) {
    const rows = snaps.filter((s) => s.band === band)
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]
      const cur = rows[i]
      if (cur.introduced < minSeen) continue
      const was = rateOf(prev) >= LEVEL_SOLID_RATE
      const now = rateOf(cur) >= LEVEL_SOLID_RATE
      if (was && !now && cur.truthLearned >= prev.truthLearned) n++
    }
  }
  return n
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}

function pct(x: number): string {
  return (x * 100).toFixed(1) + '%'
}

function main() {
  const args = process.argv.slice(2)
  const num = (k: string, d: number) =>
    Number(args.find((a) => a.startsWith('--' + k + '='))?.split('=')[1] ?? d)
  const sessions = num('sessions', 120)
  const perBand = num('pool', 120)
  const seed = num('seed', 20260919)
  const typo = num('typo', 0.03)

  const { pool, kanji } = loadPool(perBand)
  const ctx: MistakeContext = {
    lookup: (k) => kanji[k],
    koSiblingOnyomi: buildKoSiblingIndex(kanji),
  }
  const learner: Learner = {
    learn: num('learn', 0.5),
    known: num('known', 0.97),
    guess: { 0: 0.5, 1: 0.45, 2: 0.35, 3: 0.25, 4: 0.2 },
    forgetPerDay: num('forget', 0.004),
    typo,
  }
  console.log(
    `풀 ${pool.length}개(밴드당 ${perBand}) · 세션 ${sessions}회 · 시드 ${seed} · ` +
      `오타 ${pct(typo)} · 익힐확률 ${learner.learn} · 망각 ${learner.forgetPerDay}/일 · 안정문턱 ${num('stable', MEANING_STABLE_DAYS)}일`,
  )

  const stableDays = num('stable', MEANING_STABLE_DAYS)
  const snaps = run(pool, ctx, learner, sessions, seed, stableDays)
  const tail = snaps.filter((s) => s.session >= sessions / 2 && s.introduced >= 5)

  console.log('\n== 마지막 시점 ==')
  console.log('밴드 | 만남 | 익힘(수준) | 기대정답률 | A 최근30회 | B 붙은개수 | C 숙어창')
  for (const band of BANDS) {
    const last = snaps.filter((s) => s.band === band).at(-1)!
    console.log(
      `  ${band}  | ${String(last.introduced).padStart(4)} | ` +
        `${pct(last.truthRate)} (${last.truthLearned}) | ${pct(last.truthAccuracy)} | ` +
        `${pct(last.rateA)} | ${pct(last.rateB)} (${last.stableB}) | ${pct(last.rateC)}`,
    )
  }

  console.log('\n== 후반부 평균 오차 ① 「수준(익힘 비율)」 대비 — 화면이 수준이라 말하는 값이다 ==')
  for (const band of BANDS) {
    const rows = tail.filter((s) => s.band === band)
    if (rows.length === 0) continue
    const d = (f: (r: Snapshot) => number) =>
      (mean(rows.map((r) => f(r) - r.truthRate)) * 100).toFixed(1)
    console.log(
      `  밴드 ${band} — A ${d((r) => r.rateA)}%p · B ${d((r) => r.rateB)}%p · C ${d((r) => r.rateC)}%p`,
    )
  }

  console.log('\n== 후반부 평균 오차 ② 「기대 정답률」 대비 — A 가 정답률로서 편향됐는지 ==')
  for (const band of BANDS) {
    const rows = tail.filter((s) => s.band === band)
    if (rows.length === 0) continue
    const d = (f: (r: Snapshot) => number) =>
      (mean(rows.map((r) => f(r) - r.truthAccuracy)) * 100).toFixed(1)
    console.log(`  밴드 ${band} — A ${d((r) => r.rateA)}%p · C ${d((r) => r.rateC)}%p`)
  }

  console.log('\n== 익힌 숙어가 안 줄었는데 안정 → 흔들림으로 뒤집힌 횟수 ==')
  console.log(
    `  A ${flips(snaps, (s) => s.rateA)}회 · B ${flips(snaps, (s) => s.rateB)}회 · ` +
      `C ${flips(snaps, (s) => s.rateC)}회`,
  )

  console.log('\n== A 의 창 구성 (후반부 평균) ==')
  for (const band of BANDS) {
    const rows = tail.filter((s) => s.band === band)
    if (rows.length === 0) continue
    console.log(
      `  밴드 ${band} — 창 30회 안 서로 다른 숙어 ${mean(rows.map((r) => r.windowIdioms)).toFixed(1)}개 · ` +
        `아직 안 익힌 숙어가 차지한 비율 ${pct(mean(rows.map((r) => r.windowUnlearnedShare)))}`,
    )
  }

  const out = join(DICT_DIR, `sim-level-typo${Math.round(typo * 100)}.tsv`)
  writeTsvBom(
    out,
    [
      [
        'session', 'band', 'introduced', 'truthLearned', 'truthRate', 'truthAccuracy', 'rateA', 'seenA',
        'stableB', 'rateB', 'rateC', 'windowIdioms', 'windowUnlearnedShare',
      ].join('\t'),
      ...snaps.map((s) =>
        [
          s.session, s.band, s.introduced, s.truthLearned, s.truthRate.toFixed(4), s.truthAccuracy.toFixed(4),
          s.rateA.toFixed(4), s.seenA, s.stableB, s.rateB.toFixed(4), s.rateC.toFixed(4),
          s.windowIdioms, s.windowUnlearnedShare.toFixed(4),
        ].join('\t'),
      ),
    ].join('\n'),
  )
  console.log(`\n시점별 기록 → ${out}`)
}

if (import.meta.filename === process.argv[1]) main()
