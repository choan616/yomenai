// 한자 끝말잇기의 규칙 — 끝 한자가 다음 말의 첫 한자다 (2026-10-04, context-notes 같은 날 절). 화면과 분리한 순수 함수
//
// 학습 사전(밴드 0~3)의 말만 쓴다. 플레이어는 한자를 칠 수 없으므로(자판은 가나뿐) **읽기**를 쳐서 말을 낸다.

export interface Word {
  id: string
  headword: string
  reading: string
  /** 같은 표기의 다른 읽기 — 채점처럼 이것도 정답으로 받는다 */
  altReadings?: string[]
  /** 낮을수록 흔한 말 */
  band: number
}

/** 앱이 고르는 말은 흔한 말(밴드 ≤ 3)이다 — 사전의 이 범위가 기본 사전 전부다 */
const REPLY_MAX_BAND = 3
/** 앱이 이어 갈 길이 남은 말을 고를 확률. 1 이면 매번 이어 줘서 지루하다 */
const KEEP_ALIVE = 0.85

const ITERATION = '々'

/** 이어질 때 보는 끝 한자. `々` 는 앞 글자를 되풀이하는 기호라 앞 글자가 끝 한자다 (時々 → 時) */
export function tailKanji(headword: string): string {
  const cs = [...headword]
  let i = cs.length - 1
  while (i > 0 && cs[i] === ITERATION) i--
  return cs[i]!
}

export const headKanji = (headword: string): string => [...headword][0]!

/** 첫 한자 → 그 한자로 시작하는 말들 (흔한 말 먼저) */
export type Index = Map<string, Word[]>

export function buildIndex(words: readonly Word[]): Index {
  const index: Index = new Map()
  for (const w of words) {
    const h = headKanji(w.headword)
    const list = index.get(h)
    if (list) list.push(w)
    else index.set(h, [w])
  }
  for (const list of index.values()) list.sort((a, b) => a.band - b.band || a.id.localeCompare(b.id))
  return index
}

/** 가타카나로 쳐도 같은 읽기로 본다 */
export function normReading(s: string): string {
  return s.trim().replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export type Verdict =
  | { kind: 'ok'; word: Word }
  /** 읽기가 맞는 말이 있지만 이미 쓴 말뿐이다 */
  | { kind: 'used'; word: Word }
  /** 그 한자로 시작하는 말 중에 그 읽기가 없다 */
  | { kind: 'none' }

/** 플레이어가 친 읽기를 판정한다. 같은 읽기의 말이 여럿이면 안 쓴 것 중 흔한 말이다 */
export function judge(index: Index, need: string, input: string, used: ReadonlySet<string>): Verdict {
  const reading = normReading(input)
  const same = (index.get(need) ?? []).filter((w) => w.reading === reading || w.altReadings?.includes(reading))
  if (reading === '' || same.length === 0) return { kind: 'none' }
  const fresh = same.find((w) => !used.has(w.headword))
  return fresh ? { kind: 'ok', word: fresh } : { kind: 'used', word: same[0]! }
}

/** `word` 다음에 올 수 있는, 안 쓴 말들 */
export function continuations(index: Index, word: Word, used: ReadonlySet<string>): Word[] {
  return (index.get(tailKanji(word.headword)) ?? []).filter(
    (w) => w.headword !== word.headword && !used.has(w.headword),
  )
}

/** `word` 를 쓰고 난 뒤에도 이어 갈 말이 남는가 — `used` 는 `word` 를 쓰기 전 상태다 */
function alive(index: Index, word: Word, used: ReadonlySet<string>): boolean {
  const next = new Set(used).add(word.headword)
  return continuations(index, word, next).length > 0
}

/** 앱의 차례. 이을 말이 없으면 null — 플레이어 승 */
export function pickReply(
  index: Index,
  after: Word,
  used: ReadonlySet<string>,
  rng: () => number = Math.random,
): Word | null {
  const pool = continuations(index, after, used).filter((w) => w.band <= REPLY_MAX_BAND)
  if (pool.length === 0) return null
  const live = pool.filter((w) => alive(index, w, new Set(used).add(after.headword)))
  const from = live.length > 0 && rng() < KEEP_ALIVE ? live : pool
  return from[Math.floor(rng() * from.length)]!
}

/** 힌트 — 표기만 보인다(읽기를 떠올리는 게 연습이다). 흔한 말 위주 */
export function hintWords(index: Index, need: string, used: ReadonlySet<string>, n: number): Word[] {
  return (index.get(need) ?? []).filter((w) => !used.has(w.headword)).slice(0, n)
}

/** 첫 말 — 가장 흔한 말(밴드 0) 중 이을 말이 넉넉한 것 */
export function startWord(index: Index, rng: () => number = Math.random): Word {
  const all = [...index.values()].flat().filter((w) => w.band === 0)
  const rich = all.filter((w) => continuations(index, w, new Set([w.headword])).length >= 5)
  const from = rich.length > 0 ? rich : all
  return from[Math.floor(rng() * from.length)]!
}
