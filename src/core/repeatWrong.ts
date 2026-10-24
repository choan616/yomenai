// 같은 표현에 같은 오답을 되풀이했는지 판정하고 틀린 조각·짝 표현을 짚는 순수 함수 (PLAN §11 D4)
import { decompose, type KanjiReadings } from '../lib/onyomi.ts'
import { toHiragana } from '../lib/readings.ts'
import type { LearningEvent, ReviewEvent } from './types.ts'

/**
 * 읽기 색인의 최소 모양. `quiz.ts` 의 `HomophoneIndex` 가 그대로 들어온다 —
 * 거기서 타입을 가져오면 tools 의 tsconfig 가 `dict/load.ts`(vite 타입)까지 끌고 온다.
 */
export interface ReadingIndex {
  /** 읽기(히라가나) → 그 읽기가 대표 읽기인 항목 */
  byReading: ReadonlyMap<string, readonly { idiomId: string; headword: string }[]>
  byId: ReadonlyMap<string, { headword: string }>
}

/** 한자 한 글자와 그것이 덮는 읽기 구간(표면형) */
export interface Chunk {
  kanji: string
  surface: string
}

/** 어느 한 조각만 틀렸을 때의 정렬 결과. 실패 이유는 보고용이다 */
export type Alignment =
  | { ok: true; index: number; kanji: string; expected: string; wrong: string }
  | { ok: false; reason: 'NO_PARSE' | 'NO_SINGLE' | 'AMBIGUOUS' }

/**
 * 기대 읽기의 조각 열(`chunks`)에 W 를 맞춘다. 앞쪽 조각들과 뒤쪽 조각들이 W 의 앞뒤에 그대로 붙고
 * 가운데 한 토막만 다르면 그 조각이 틀린 조각이다. 조각이 둘 이상 틀렸거나 글자를 통째로 빠뜨리면
 * `NO_SINGLE`, 맞는 자리가 둘 이상이면(장음 삽입처럼 경계에 걸친 경우) W 자신의 분해 `wrongChunks` 로
 * 가린다 — 그 자리만 기대와 다르고 나머지는 같은 후보 하나가 남으면 채택하고, 아니면 `AMBIGUOUS` 다.
 */
export function alignWrong(
  chunks: readonly Chunk[] | null,
  wrong: string,
  wrongChunks: readonly Chunk[] | null = null,
): Alignment {
  if (chunks === null) return { ok: false, reason: 'NO_PARSE' }
  const hits: Extract<Alignment, { ok: true }>[] = []
  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.slice(0, i).map((c) => c.surface).join('')
    const suffix = chunks.slice(i + 1).map((c) => c.surface).join('')
    if (wrong.length <= prefix.length + suffix.length) continue
    if (!wrong.startsWith(prefix) || !wrong.endsWith(suffix)) continue
    const mid = wrong.slice(prefix.length, wrong.length - suffix.length)
    if (mid === chunks[i]!.surface) continue
    hits.push({ ok: true, index: i, kanji: chunks[i]!.kanji, expected: chunks[i]!.surface, wrong: mid })
  }
  if (hits.length === 0) return { ok: false, reason: 'NO_SINGLE' }
  if (hits.length === 1) return hits[0]!
  if (wrongChunks !== null && wrongChunks.length === chunks.length) {
    const viable = hits.filter((h) =>
      chunks.every((c, j) => wrongChunks[j]!.surface === (j === h.index ? h.wrong : c.surface)),
    )
    if (viable.length === 1) return viable[0]!
  }
  return { ok: false, reason: 'AMBIGUOUS' }
}

/** 이벤트에 저장된 답과 같은 방식의 정규화 — 공백 제거 뒤 히라가나 */
function normalize(answer: string): string {
  return toHiragana(answer.trim())
}

/**
 * 이번 답 **이전** 기록(`prior`)에 같은 표현·같은 답의 읽기 오답이 있으면 true.
 * 삭제된 이벤트·뜻 카드·정답은 안 센다. 빈 답(넘김·모르겠음)은 「무엇을 골랐는지」가 없어 false.
 */
export function sameWrongBefore(prior: readonly LearningEvent[], idiomId: string, answer: string): boolean {
  const a = normalize(answer)
  if (a === '') return false
  return prior.some(
    (e): e is ReviewEvent =>
      e.type === 'review' &&
      e.deletedAt === null &&
      e.cardType === 'reading' &&
      !e.correct &&
      e.idiomId === idiomId &&
      normalize(e.answer) === a,
  )
}

export interface WrongPiece {
  kanji: string
  /** 기대 읽기에서 이 한자가 덮는 구간 */
  expectedPiece: string
  /** 사용자가 그 자리에 쓴 구간 */
  answerPiece: string
}

/** 기대 읽기를 한자별로 나눠 답과 맞춰 본다. 한 조각만 틀린 경우만 돌려주고 모호하거나 분해가 안 되면 null */
export function wrongPiece(
  headword: string,
  expected: string,
  answer: string,
  lookup: (kanji: string) => KanjiReadings | undefined,
): WrongPiece | null {
  const wrong = normalize(answer)
  if (wrong === '') return null
  const chunksOf = (reading: string): Chunk[] | null => {
    const d = decompose(headword, reading, lookup)
    return d.ok ? d.segments.map((s) => ({ kanji: s.kanji, surface: s.surface })) : null
  }
  const al = alignWrong(chunksOf(expected), wrong, chunksOf(wrong))
  return al.ok ? { kanji: al.kanji, expectedPiece: al.expected, answerPiece: al.wrong } : null
}

/**
 * 오답이 사용자가 이미 학습한 **다른 표현 하나**의 대표 읽기와 정확히 같을 때 그 표현.
 * 둘 이상이거나 없으면 null. 같은 표기(다른 읽기)는 짝이 아니라 같은 표현의 다른 읽기라 뺀다.
 */
export function confusedWith(
  answer: string,
  idiomId: string,
  learned: ReadonlySet<string>,
  readingIndex: ReadingIndex,
): { idiomId: string; headword: string } | null {
  const a = normalize(answer)
  if (a === '') return null
  const selfHeadword = readingIndex.byId.get(idiomId)?.headword
  const found = (readingIndex.byReading.get(a) ?? []).filter(
    (it) => it.idiomId !== idiomId && it.headword !== selfHeadword && learned.has(it.idiomId),
  )
  return found.length === 1 ? { idiomId: found[0]!.idiomId, headword: found[0]!.headword } : null
}

/** 이전에 읽기 카드를 푼 적 있는 표현 id 집합 — 「이미 학습한」 의 기준 */
export function learnedReadingIds(prior: readonly LearningEvent[]): Set<string> {
  const out = new Set<string>()
  for (const e of prior) {
    if (e.type === 'review' && e.deletedAt === null && e.cardType === 'reading') out.add(e.idiomId)
  }
  return out
}

export interface RepeatHint {
  /** 정규화한 답 — 「전에도 X로 읽었어요」 의 X */
  answer: string
  piece?: WrongPiece
  pair?: { idiomId: string; headword: string }
}

/** 같은 오답 되풀이 한 줄의 재료. 2회째 이상이 아니면 null */
export function repeatHint(input: {
  /** 이번 답 이전의 이벤트 */
  prior: readonly LearningEvent[]
  idiomId: string
  headword: string
  expected: string
  answer: string
  lookup: (kanji: string) => KanjiReadings | undefined
  /** 이미 학습한 표현 id (이번 답 이전 기준) */
  learned: ReadonlySet<string>
  readingIndex: ReadingIndex
}): RepeatHint | null {
  const { prior, idiomId, headword, expected, answer, lookup, learned, readingIndex } = input
  if (!sameWrongBefore(prior, idiomId, answer)) return null
  const hint: RepeatHint = { answer: normalize(answer) }
  const piece = wrongPiece(headword, expected, answer, lookup)
  if (piece !== null) hint.piece = piece
  const pair = confusedWith(answer, idiomId, learned, readingIndex)
  if (pair !== null) hint.pair = pair
  return hint
}
