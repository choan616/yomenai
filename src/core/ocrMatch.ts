// 카메라 인식 결과를 사전과 맞춰 보는 순수 로직 — 어느 배율을 믿을지, 무엇을 후보로 낼지
//
// 인식 자체(`src/dict/ocr.ts`)와 떼어 둔다. 여기는 부수효과가 없어 단위 검사로 못 박을 수
// 있고, 실제로 **여기가 틀려서 엉뚱한 답이 나왔다** — 첫 적중에서 멈추던 탓에 무너진
// 꼬리에서 주운 두 글자(`和合`·`自重`)가 답이 됐다 (2026-09-23 폰 실측).

/** 인식 한 번의 결과. `size` 는 넣은 조각의 가로지르는 축 길이(px) — 로그·진단용이다 */
export interface OcrAttempt {
  size: number
  text: string
}

/** 사전에서 찾은 것. 화면이 쓰는 최소한만 둔다 */
export interface DictHit {
  idiomId: string
  headword: string
  reading: string
}

/** 표기 → 사전 항목. 없으면 `undefined` */
export type Lookup = (headword: string) => DictHit | undefined

/** 사전에 실리는 숙어의 길이 범위. 2자 미만은 표제어가 아니고, 6자를 넘으면 잡소리다 */
const MIN_LEN = 2
const MAX_LEN = 6

/**
 * 공백류를 턴다. 터서랙트는 한자 사이에 공백을 잘 넣는다.
 * 비교 전에 반드시 지나야 하는 문이라 여기 하나만 둔다
 */
export function normalize(text: string): string {
  return text.replace(/[\s　]/g, '')
}

/**
 * 인식 결과 **안의 어느 구간이든** 사전에 있으면 잡는다. 긴 것부터 본다.
 *
 * 네모가 단어보다 조금 크면 이웃 글자가 딸려 온다 — 실측에서 `爆弾` 이 `『爆弾は知` 로,
 * `飲料` 가 `4ら飲料缶の` 로 나왔다. 조사·따옴표를 걷어내는 일을 사전이 대신한다.
 */
export function findInDict(text: string, lookup: Lookup): DictHit | undefined {
  const s = normalize(text)
  for (let len = Math.min(MAX_LEN, s.length); len >= MIN_LEN; len--) {
    for (let i = 0; i + len <= s.length; i++) {
      const hit = lookup(s.slice(i, i + len))
      if (hit) return hit
    }
  }
  return undefined
}

/**
 * 여러 배율의 결과 중 무엇을 믿을지.
 *
 * **가장 긴 적중이 이긴다.** 첫 적중에서 멈추면 무너진 꼬리에서 주운 두 글자가 답이 된다
 * (실측: 「…手抜きとい党地和合和滞る…」에서 `和合`). 같은 길이면 잡소리가 적은 쪽 —
 * 짧은 결과를 고른다.
 *
 * 하나도 못 맞히면 **글자가 가장 많이 읽힌 것**을 돌려준다. 근사 매칭이 그걸 쓴다.
 */
export function pickBest(
  attempts: readonly OcrAttempt[],
  lookup: Lookup,
): { attempt: OcrAttempt; hit: DictHit | undefined } | undefined {
  if (attempts.length === 0) return undefined
  let best: { attempt: OcrAttempt; hit: DictHit | undefined } | undefined
  let bestScore = -Infinity
  for (const attempt of attempts) {
    const text = normalize(attempt.text)
    const hit = findInDict(text, lookup)
    // 적중한 것이 무조건 앞선다. 그 안에서 긴 것 → 잡소리 적은 것 순
    const score = hit ? 1e6 + hit.headword.length * 1000 - text.length : text.length
    if (score > bestScore) {
      bestScore = score
      best = { attempt, hit }
    }
  }
  return best
}

/**
 * 한 자만 어긋난 표기를 **후보로** 모은다.
 *
 * 오답이 `軍艦→軍朋`·`課徴金→課微金` 처럼 한 자만 틀리는 꼴이라 되살릴 여지가 크다.
 * 다만 **단정하지 않는다** — 읽기를 배우는 앱에서 틀린 단어를 맞다고 하면 그게 곧
 * 오학습이다. 고르는 것은 사용자다 (context-notes 결정 6).
 *
 * `headwords` 는 길이가 같은 표제어만 받는다. 전수를 훑으면 16,947개를 매번 비교한다.
 */
export function nearMisses(
  text: string,
  headwords: Iterable<string>,
  limit = 8,
): string[] {
  const s = normalize(text)
  if (s.length < MIN_LEN) return []
  const out: string[] = []
  for (const head of headwords) {
    if (head.length !== s.length) continue
    let diff = 0
    for (let i = 0; i < head.length; i++) {
      if (head[i] !== s[i]) diff++
      if (diff > 1) break
    }
    if (diff === 1) {
      out.push(head)
      if (out.length >= limit) break
    }
  }
  return out
}

/**
 * 인식 결과 안에서 **사전이 집어낸 구간**의 위치. 화면이 그 부분만 도드라지게 쓴다.
 *
 * 원문 `4ら飲料缶の` 중 `飲料` 가 걸린 것인데 화면이 그걸 안 알려 주면 사용자가 무엇을
 * 찾았는지 모른다 (2026-09-23 실물 확인).
 */
export function hitSpan(text: string, headword: string): { before: string; hit: string; after: string } {
  const s = normalize(text)
  const at = s.indexOf(headword)
  if (at < 0) return { before: s, hit: '', after: '' }
  return { before: s.slice(0, at), hit: headword, after: s.slice(at + headword.length) }
}
