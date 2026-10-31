// 세션 중간 환기 퀴즈(동음이의 표기 고르기)의 문항을 만드는 순수 함수 — 기록·채점과 무관하다 (PLAN §11 S4)
import { stripLongVowels, toHiragana, unvoiceAll } from '../lib/readings.ts'
import type { RuntimeIdiom } from '../dict/load.ts'

/** 문항 재료로 쓰는 사전 항목의 최소 모양. `RuntimeIdiom` 은 그대로 넘기면 된다 */
export type QuizIdiom = Pick<RuntimeIdiom, 'idiomId' | 'headword' | 'reading' | 'koMeaning'>

/** 읽기로 묶은 색인. 한 번 만들어 문항마다 재사용한다 */
export interface HomophoneIndex<T extends QuizIdiom = QuizIdiom> {
  /** 읽기(히라가나) → 그 읽기가 대표 읽기인 항목. 같은 표기는 한 줄만 남긴다 */
  byReading: Map<string, T[]>
  /** `nearKey` → 읽기가 비슷한 항목. 같은 읽기 묶음을 **포함한다** */
  byNear: Map<string, T[]>
  byId: Map<string, T>
  /** 표기 → 그 표기를 쓰는 모든 id. 동형이독을 표기 단위로 가릴 때 쓴다 */
  byHeadword: Map<string, string[]>
}

export interface QuizOption {
  idiomId: string
  headword: string
}

export interface HomophoneQuestion {
  kind: 'headword'
  /** 정답 표현 id */
  targetId: string
  /** 제시하는 읽기(히라가나) */
  reading: string
  /** 제시하는 한국어 뜻 — 정답 보기의 뜻과 같다 */
  meaning: string
  /** 섞인 보기. 3~4개, 표기 중복 없음, 뜻이 서로 겹치지 않음 */
  options: QuizOption[]
}

export interface ReadingOption {
  idiomId: string
  reading: string
}

/** 표기를 보여 주고 읽기를 고르는 문항 — 보기는 읽기가 비슷한 다른 표현의 읽기다 */
export interface ReadingQuestion {
  kind: 'reading'
  targetId: string
  headword: string
  /** 섞인 보기. 3~4개, 읽기 중복 없음, 같은 표기의 다른 읽기는 들어가지 않음 */
  options: ReadingOption[]
}

export type QuizQuestion = HomophoneQuestion | ReadingQuestion

/** 정답 포함 보기 수의 하한·상한 */
export const MIN_OPTIONS = 3
export const MAX_OPTIONS = 4

function meaningOf(it: QuizIdiom): string {
  return (it.koMeaning?.definition ?? '').trim()
}

/** 「이후, ~부터」 → {이후, ~부터}. 한국어 뜻은 쉼표·세미콜론으로 갈래를 나열한다 */
function senseTokens(meaning: string): Set<string> {
  return new Set(
    meaning
      .split(/[,;，；、]/u)
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  )
}

/**
 * 뜻이 같거나 갈래가 하나라도 겹치면 한 문제의 보기로 함께 못 둔다 — 정답이 둘로 갈린다.
 * 문자열 전체 일치만 보면 意志 「의지, 뜻」· 意思 「의지, 뜻, 목적」 이 빠져나간다
 */
function overlaps(a: Set<string>, b: Set<string>): boolean {
  for (const t of a) if (b.has(t)) return true
  return false
}

/**
 * 탁음·장음·촉음 차이를 한 자리에 모으는 키 — こうしょう·こうしょ·こうじょう 가 한 묶음이 된다.
 * 읽기가 꼭 같은 보기를 셋 이상 낼 수 있는 표현은 세션 카드의 2% 남짓이라(2026-10-24 실측)
 * 그것만으로는 퀴즈가 거의 안 섰다. 뜻이 겹치는 보기를 버리는 규칙은 묶음과 무관하게 그대로다.
 *
 * shortcut: じ↔し·ず↔す 쌍은 한 묶음이 안 된다(`unvoiceAll` 이 글자마다 청음을 하나만 들어
 * 人心 じんしん 이 しんしん 과 안 만난다 — `readings.ts` 의 四つ仮名 주석). 그 문항이
 * 필요해지면 키에 ち→し·つ→す 한 겹을 더한다
 */
function nearKey(hira: string): string {
  return unvoiceAll(stripLongVowels(hira.replace(/っ/gu, '')))
}

export function buildHomophoneIndex<T extends QuizIdiom>(idioms: readonly T[]): HomophoneIndex<T> {
  const byReading = new Map<string, T[]>()
  const byNear = new Map<string, T[]>()
  const byId = new Map<string, T>()
  const byHeadword = new Map<string, string[]>()
  for (const it of idioms) {
    byId.set(it.idiomId, it)
    const ids = byHeadword.get(it.headword)
    if (ids === undefined) byHeadword.set(it.headword, [it.idiomId])
    else ids.push(it.idiomId)
    const key = toHiragana(it.reading)
    if (key === '') continue
    for (const [map, k] of [
      [byReading, key],
      [byNear, nearKey(key)],
    ] as const) {
      let list = map.get(k)
      if (list === undefined) map.set(k, (list = []))
      // JMdict 는 읽기마다 항목을 따로 둬서 같은 표기가 겹칠 수 있다 — 첫 줄만 남긴다
      if (!list.some((o) => o.headword === it.headword)) list.push(it)
    }
  }
  return { byReading, byNear, byId, byHeadword }
}

function shuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * 읽기가 같거나 비슷한 다른 표기를 고르는 문항. 조건 미달이면 null —
 * 정답에 뜻이 없거나, 뜻으로 갈리는 보기를 2개 이상 못 채우는 경우다.
 * 같은 `rand` 순서면 결과가 같다.
 *
 * **두 묶음 중 어느 쪽을 먼저 볼지는 난수가 정한다**(사용자 결정 2026-10-29). 비율을 강제하지
 * 않는다 — 동음 재료가 2% 뿐이라 「동음 1 + 근접 1」 로 고정하면 퀴즈가 아예 안 서는 날이 생긴다.
 */
export function homophoneQuestion<T extends QuizIdiom>(
  target: T,
  index: HomophoneIndex<T>,
  rand: () => number,
  /**
   * 정답·보기에 못 쓰는 idiomId. 보기는 읽기를 보여 주고 답 뒤에 각 보기의 뜻을 보여 주므로,
   * 세션 뒤에 아직 카드가 남은 숙어를 쓰면 그 카드의 답이 미리 드러난다
   */
  exclude?: ReadonlySet<string>,
): HomophoneQuestion | null {
  const meaning = meaningOf(target)
  if (meaning === '') return null
  if (exclude?.has(target.idiomId)) return null
  const key = toHiragana(target.reading)
  const exact = index.byReading.get(key)
  if (exact === undefined) return null
  const near = index.byNear.get(nearKey(key)) ?? exact
  const targetTokens = senseTokens(meaning)

  const pick = (group: readonly T[]): T[] => {
    const chosen: { it: T; tokens: Set<string> }[] = []
    const taken = new Set<string>([target.headword])
    for (const cand of shuffle(group, rand)) {
      if (chosen.length >= MAX_OPTIONS - 1) break
      if (cand.idiomId === target.idiomId || taken.has(cand.headword)) continue
      if (exclude?.has(cand.idiomId)) continue
      const m = meaningOf(cand)
      if (m === '') continue
      const tokens = senseTokens(m)
      if (overlaps(tokens, targetTokens) || chosen.some((c) => overlaps(tokens, c.tokens))) continue
      chosen.push({ it: cand, tokens })
      taken.add(cand.headword)
    }
    return chosen.map((c) => c.it)
  }

  // 못 채우면 다른 묶음으로 간다. 근접 묶음이 동음 묶음을 포함하므로 근접이 먼저였던 경우의
  // 두 번째 시도는 더 나올 것이 없지만, 한 줄을 아끼려고 양쪽을 같은 모양으로 둔다
  const nearFirst = rand() < 0.5
  let chosen = pick(nearFirst ? near : exact)
  if (chosen.length + 1 < MIN_OPTIONS) chosen = pick(nearFirst ? exact : near)
  if (chosen.length + 1 < MIN_OPTIONS) return null

  const options: QuizOption[] = shuffle(
    [target, ...chosen].map((it) => ({
      idiomId: it.idiomId,
      headword: it.headword,
    })),
    rand,
  )
  return { kind: 'headword', targetId: target.idiomId, reading: key, meaning, options }
}

const HAS_KANJI = /[々〆一-鿿㐀-䶿]/u

/**
 * 표기를 보고 읽기를 고르는 문항. 조건 미달이면 null — 표기에 한자가 없거나, 정답과 다른 읽기를
 * 2개 이상 못 채우는 경우다. 보기는 읽기가 비슷한 **실제 표현**의 읽기라 헷갈리는 소리를 그대로 묻는다.
 *
 * 같은 표기의 읽기는 전부 정답이라 보기에서 뺀다 — 早々 そうそう·はやばや 처럼 동형이독이면
 * 정답이 둘로 갈린다. `exclude` 는 보기의 읽기에도 적용한다: 세션 뒤에 남은 카드의 읽기가 미리 드러난다
 */
export function readingQuestion<T extends QuizIdiom>(
  target: T,
  index: HomophoneIndex<T>,
  rand: () => number,
  exclude?: ReadonlySet<string>,
): ReadingQuestion | null {
  if (exclude?.has(target.idiomId) || !HAS_KANJI.test(target.headword)) return null
  const key = toHiragana(target.reading)
  const near = index.byNear.get(nearKey(key))
  if (near === undefined) return null
  const taken = new Set<string>([key])
  for (const id of index.byHeadword.get(target.headword) ?? []) {
    const r = index.byId.get(id)?.reading
    if (r !== undefined) taken.add(toHiragana(r))
  }
  const chosen: T[] = []
  for (const cand of shuffle(near, rand)) {
    if (chosen.length >= MAX_OPTIONS - 1) break
    const r = toHiragana(cand.reading)
    if (exclude?.has(cand.idiomId) || taken.has(r)) continue
    chosen.push(cand)
    taken.add(r)
  }
  if (chosen.length + 1 < MIN_OPTIONS) return null
  const options = shuffle(
    [target, ...chosen].map((it) => ({ idiomId: it.idiomId, reading: toHiragana(it.reading) })),
    rand,
  )
  return { kind: 'reading', targetId: target.idiomId, headword: target.headword, options }
}

/**
 * 우선순위 순 후보에서 최대 `n` 문항. 같은 묶음은 한 문항만 낸다 —
 * 연달아 같은 보기 무리를 보면 환기가 아니라 반복이 된다.
 * 가리는 단위는 `nearKey` 다. 읽기 단위로 가리면 こうしょう 다음에 こうしょ 가 서서
 * 보기 무리가 겹친다
 */
export function pickQuizQuestions<T extends QuizIdiom>(
  candidates: readonly string[],
  index: HomophoneIndex<T>,
  n: number,
  rand: () => number,
  /** `homophoneQuestion` 의 `exclude` 와 같다 — 정답 후보와 보기 모두에 적용한다 */
  exclude?: ReadonlySet<string>,
): QuizQuestion[] {
  const out: QuizQuestion[] = []
  const usedGroups = new Set<string>()
  for (const id of candidates) {
    if (out.length >= n) break
    const target = index.byId.get(id)
    if (target === undefined) continue
    const group = nearKey(toHiragana(target.reading))
    if (usedGroups.has(group)) continue
    // 읽기 고르기는 마지막 칸에만 한 문항(2026-10-31 「가볍게」) — 못 세우면 표기 고르기로 채운다
    const last = n >= 2 && out.length === n - 1
    const q =
      (last ? readingQuestion(target, index, rand, exclude) : null) ??
      homophoneQuestion(target, index, rand, exclude)
    if (q === null) continue
    usedGroups.add(group)
    out.push(q)
  }
  return out
}
