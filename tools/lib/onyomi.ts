// 숙어(한자 표기 + 읽기)를 (한자, 음독/훈독) 쌍으로 분해하는 핵심 로직
import {
  surfaceCandidates, canFollowSokuon, surfaceCost, normalizeKanjidicReading, unvoiceHead,
  type BaseReading, type Surface,
} from './readings.ts'

export interface KanjiReadings {
  onyomi: string[]
  kunyomi: string[]
}

/** 분해 결과의 한 조각 — 한자 1자가 읽기의 어느 구간을 어떤 원형으로 덮는지 */
export interface Segment {
  kanji: string
  /** 읽기에 실제로 나타난 표면형 */
  surface: string
  /** KANJIDIC 원형(히라가나 정규화)을 청음으로 되돌린 대표형. 음독 쌍의 식별자는 (kanji, base) 다 */
  base: string
  kind: 'on' | 'kun'
  variants: string[]
}

export type FailReason = 'KATAKANA_READING' | 'UNKNOWN_KANJI' | 'NO_PARSE' | 'BUDGET'

export type Decomposition =
  | { ok: true; segments: Segment[]; cost: number; mixed: boolean }
  | { ok: false; reason: FailReason }

/** 탐색 노드 상한. 초과하면 BUDGET 실패로 보고해 조용한 오분해를 막는다 */
const BUDGET = 50000

/** 음훈이 바뀌는 경계마다 붙는 비용. 重箱·湯桶 읽기는 실재하므로 금지가 아니라 감점이다 */
const SWITCH_COST = 0.5

/**
 * KANJIDIC 읽기 목록은 대략 통용도 순이다. 동점 해석에서 뒤쪽의 희귀 읽기가
 * 뽑히지 않도록 순위에 아주 작은 비용을 매긴다 (思出 = 思い+出 이지 思+い出 가 아니다).
 * 어떤 실제 음운 변형(최소 0.5)보다도 작아 순위가 변형 판단을 뒤집지 못한다.
 */
const RANK_COST = 0.01

function collectBases(
  chars: string[],
  lookup: (k: string) => KanjiReadings | undefined,
): BaseReading[][] | null {
  const bases: BaseReading[][] = []
  for (const c of chars) {
    const rec = lookup(c)
    if (!rec) return null
    // 같은 읽기가 사전형과 파생형 양쪽에서 나오면 싼 쪽만 남긴다 (取 の とり 등)
    const best = new Map<string, BaseReading>()
    for (const [kind, raws] of [['on', rec.onyomi], ['kun', rec.kunyomi]] as const) {
      raws.forEach((raw, rank) => {
        for (const b of normalizeKanjidicReading(raw, kind)) {
          const key = kind + '|' + b.text
          const cost = b.cost + rank * RANK_COST
          const prev = best.get(key)
          // 같은 읽기가 접두형·비접두형 양쪽에 있으면 접두 자격을 살린다 (真 の ま 와 ま-)
          const prefix = (prev?.prefix ?? false) || b.prefix
          if (prev === undefined || cost < prev.cost) best.set(key, { ...b, cost, prefix })
          else best.set(key, { ...prev, prefix })
        }
      })
    }
    bases.push([...best.values()])
  }
  return bases
}

/**
 * 읽기를 한자 수만큼의 구간으로 나눈다.
 * 여러 해석이 가능하면 변형 비용이 최소인 것을 고르고, 동점이면 음훈 전환이 적은 쪽을 고른다.
 */
export function decompose(
  headword: string,
  reading: string,
  lookup: (k: string) => KanjiReadings | undefined,
): Decomposition {
  if (!/^[ぁ-ゖー]+$/u.test(reading)) return { ok: false, reason: 'KATAKANA_READING' }

  // 々 는 직전 한자의 반복이므로 원 한자로 펼친다
  const chars: string[] = []
  for (const ch of headword) {
    if (ch === '々') {
      if (chars.length === 0) return { ok: false, reason: 'UNKNOWN_KANJI' }
      chars.push(chars[chars.length - 1])
    } else chars.push(ch)
  }

  const bases = collectBases(chars, lookup)
  if (bases === null) return { ok: false, reason: 'UNKNOWN_KANJI' }

  let best: { segs: Surface[]; cost: number } | null = null
  let budget = BUDGET
  const picked: Surface[] = []

  const walk = (i: number, pos: number, prevTail: string, cost: number): void => {
    if (budget-- <= 0) return
    if (best !== null && cost >= best.cost) return // 이미 더 나은 해석이 있다
    if (i === chars.length) {
      if (pos === reading.length) best = { segs: [...picked], cost }
      return
    }
    const isLast = i === chars.length - 1
    for (const cand of surfaceCandidates(bases[i], prevTail, isLast)) {
      if (prevTail === 'っ' && !canFollowSokuon(cand.text)) continue
      if (!reading.startsWith(cand.text, pos)) continue
      // 남은 한자마다 최소 한 글자는 필요하다
      if (reading.length - (pos + cand.text.length) < chars.length - i - 1) continue
      const add = surfaceCost(cand) + (i > 0 && picked[i - 1].kind !== cand.kind ? SWITCH_COST : 0)
      picked.push(cand)
      walk(i + 1, pos + cand.text.length, cand.text.at(-1)!, cost + add)
      picked.pop()
    }
  }
  walk(0, 0, '', 0)

  if (best === null) return { ok: false, reason: budget <= 0 ? 'BUDGET' : 'NO_PARSE' }
  const { segs, cost } = best as { segs: Surface[]; cost: number }
  return {
    ok: true,
    cost,
    mixed: segs.some((s) => s.kind !== segs[0].kind),
    segments: segs.map((s, i) => canonicalize(chars[i], s, bases[i])),
  }
}

/**
 * 탁음형 원형을 같은 한자의 청음형으로 되돌린다.
 * KANJIDIC 은 이미 탁음화된 접미형을 별도 읽기로 싣는데(金 の -がね, 取 の -ど.り),
 * 그대로 두면 金:かね 와 金:がね 가 다른 쌍이 되어 음독 숙달 집계가 쪼개진다.
 *
 * 훈독에만 적용한다. 음독의 シ/ジ, ハン/バン 같은 쌍은 呉音·漢音으로 갈린 별개 읽기이지
 * 連濁 변형이 아니라서(次 の ジ 는 シ 의 탁음화가 아니다) 병합하면 진단이 틀어진다.
 */
function canonicalize(kanji: string, s: Surface, bases: BaseReading[]): Segment {
  const seg: Segment = { kanji, surface: s.text, base: s.base, kind: s.kind, variants: s.variants }
  if (s.kind !== 'kun') return seg
  const plain = unvoiceHead(s.base)
  if (plain !== null && bases.some((b) => b.kind === 'kun' && b.text === plain)) {
    seg.base = plain
    if (!seg.variants.includes('rendaku')) seg.variants = [...seg.variants, 'rendaku']
  }
  return seg
}

/** 음독 쌍의 안정적 식별자 */
export function pairId(kanji: string, base: string, kind: 'on' | 'kun'): string {
  return `${kanji}:${kind}:${base}`
}
