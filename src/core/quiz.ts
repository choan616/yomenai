// 세션 중간 환기 퀴즈(동음이의 표기 고르기)의 문항을 만드는 순수 함수 — 기록·채점과 무관하다 (PLAN §11 S4)
import { toHiragana } from '../lib/readings.ts'
import type { RuntimeIdiom } from '../dict/load.ts'

/** 문항 재료로 쓰는 사전 항목의 최소 모양. `RuntimeIdiom` 은 그대로 넘기면 된다 */
export type QuizIdiom = Pick<RuntimeIdiom, 'idiomId' | 'headword' | 'reading' | 'koMeaning'>

/** 같은 읽기로 묶은 색인. 한 번 만들어 문항마다 재사용한다 */
export interface HomophoneIndex<T extends QuizIdiom = QuizIdiom> {
  /** 읽기(히라가나) → 그 읽기가 대표 읽기인 항목. 같은 표기는 한 줄만 남긴다 */
  byReading: Map<string, T[]>
  byId: Map<string, T>
}

export interface QuizOption {
  idiomId: string
  headword: string
}

export interface HomophoneQuestion {
  /** 정답 표현 id */
  targetId: string
  /** 제시하는 읽기(히라가나) */
  reading: string
  /** 제시하는 한국어 뜻 — 정답 보기의 뜻과 같다 */
  meaning: string
  /** 섞인 보기. 3~4개, 표기 중복 없음, 뜻이 서로 겹치지 않음 */
  options: QuizOption[]
}

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

export function buildHomophoneIndex<T extends QuizIdiom>(idioms: readonly T[]): HomophoneIndex<T> {
  const byReading = new Map<string, T[]>()
  const byId = new Map<string, T>()
  for (const it of idioms) {
    byId.set(it.idiomId, it)
    const key = toHiragana(it.reading)
    if (key === '') continue
    let list = byReading.get(key)
    if (list === undefined) byReading.set(key, (list = []))
    // JMdict 는 읽기마다 항목을 따로 둬서 같은 표기가 겹칠 수 있다 — 첫 줄만 남긴다
    if (!list.some((o) => o.headword === it.headword)) list.push(it)
  }
  return { byReading, byId }
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
 * 같은 읽기의 다른 표기를 고르는 문항. 조건 미달이면 null —
 * 정답에 뜻이 없거나, 뜻으로 갈리는 보기를 2개 이상 못 채우는 경우다.
 * 같은 `rand` 순서면 결과가 같다.
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
  const group = index.byReading.get(key)
  if (group === undefined) return null

  const chosen: { it: T; tokens: Set<string> }[] = []
  const taken = new Set<string>([target.headword])
  const targetTokens = senseTokens(meaning)
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
  if (chosen.length + 1 < MIN_OPTIONS) return null

  const options: QuizOption[] = shuffle(
    [target, ...chosen.map((c) => c.it)].map((it) => ({
      idiomId: it.idiomId,
      headword: it.headword,
    })),
    rand,
  )
  return { targetId: target.idiomId, reading: key, meaning, options }
}

/**
 * 우선순위 순 후보에서 최대 `n` 문항. 같은 읽기 묶음은 한 문항만 낸다 —
 * 연달아 같은 보기 무리를 보면 환기가 아니라 반복이 된다.
 */
export function pickQuizQuestions<T extends QuizIdiom>(
  candidates: readonly string[],
  index: HomophoneIndex<T>,
  n: number,
  rand: () => number,
  /** `homophoneQuestion` 의 `exclude` 와 같다 — 정답 후보와 보기 모두에 적용한다 */
  exclude?: ReadonlySet<string>,
): HomophoneQuestion[] {
  const out: HomophoneQuestion[] = []
  const usedReadings = new Set<string>()
  for (const id of candidates) {
    if (out.length >= n) break
    const target = index.byId.get(id)
    if (target === undefined) continue
    const key = toHiragana(target.reading)
    if (usedReadings.has(key)) continue
    const q = homophoneQuestion(target, index, rand, exclude)
    if (q === null) continue
    usedReadings.add(key)
    out.push(q)
  }
  return out
}
