// 가나 정규화와 일본어 복합어 음운 변형(連濁·促音便·連声) 후보를 생성하는 빌드 스크립트 공용 모듈

/** 카타카나 → 히라가나. ー(장음부)는 직전 모음으로 펼친다 */
export function toHiragana(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0)!
    if (c >= 0x30a1 && c <= 0x30f6) out += String.fromCodePoint(c - 0x60)
    else if (ch === 'ー') out += longVowelOf(out.at(-1) ?? '')
    else out += ch
  }
  return out
}

// 장음부를 직전 가나의 모음으로 환원한다 (コート → こおと 가 아니라 こうと 인 경우가 있어 완벽하지 않지만,
// KANJIDIC 음독에서 ー 는 극소수이고 실패 시 다른 후보가 매칭된다)
function longVowelOf(prev: string): string {
  const v = vowelOf(prev)
  return v === 'o' ? 'う' : v === 'e' ? 'い' : v === 'a' ? 'あ' : v === 'i' ? 'い' : v === 'u' ? 'う' : ''
}

const VOWEL_ROWS: Record<string, string> = {
  a: 'あかがさざただなはばぱまやらわぁゃ',
  i: 'いきぎしじちぢにひびぴみりゐぃ',
  u: 'うくぐすずつづぬふぶぷむゆるぅゅっ',
  e: 'えけげせぜてでねへべぺめれゑぇ',
  o: 'おこごそぞとどのほぼぽもよろをぉょ',
}
function vowelOf(kana: string): string | null {
  for (const [v, set] of Object.entries(VOWEL_ROWS)) if (set.includes(kana)) return v
  return null
}

// 連濁 — 청음 → 탁음 (어두 자음 유성화). 값이 배열이면 후보가 여럿이다
// ち·つ 는 現代仮名遣い에서 ぢ·づ 와 じ·ず 로 갈린다 (鼻血 はなぢ 대 年中 ねんじゅう). 둘 다 낸다
const RENDAKU: Record<string, string | string[]> = {
  か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご',
  さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ',
  た: 'だ', ち: ['ぢ', 'じ'], つ: ['づ', 'ず'], て: 'で', と: 'ど',
  は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ',
}
// 半濁音 — っ·ん 뒤 は행이 ぱ행이 된다 (発表 はっぴょう, 心配 しんぱい)
const HANDAKU: Record<string, string> = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' }
// 連声 — ん 뒤 あ행/や행이 な행·ま행이 된다 (反応 はんのう, 三位 さんみ)
const RENJO: Record<string, string[]> = {
  あ: ['な', 'ま'], い: ['に', 'み'], う: ['ぬ', 'む'], え: ['ね', 'め'], お: ['の', 'も'],
  や: ['にゃ'], ゆ: ['にゅ'], よ: ['にょ'],
}
/** 促音便이 일어날 수 있는 말미 가나 */
// り 는 훈독 연용형에서만 나타난다 (切手 きって < きり + て)
const SOKUON_TAIL = new Set(['つ', 'ち', 'く', 'き', 'り'])
/** 促音(っ) 뒤에 올 수 있는 자음 행 — 무성 자음만 */
const AFTER_SOKUON = new Set([
  ...'かきくけこきゃきゅきょ', ...'さしすせそしゃしゅしょ',
  ...'たちつてとちゃちゅちょ', ...'はひふへほひゃひゅひょ',
  ...'ぱぴぷぺぽぴゃぴゅぴょ',
])

export type VariantKind = 'rendaku' | 'sokuon' | 'handaku' | 'renjo'

/** 변형 1회 적용 결과. cost 가 낮을수록 더 그럴듯한 해석이다 */
export const VARIANT_COST: Record<VariantKind, number> = {
  rendaku: 1,
  sokuon: 1,
  handaku: 0, // っ·ん 뒤에서는 의무적이라 비용을 물리지 않는다
  renjo: 2,
}

export interface Surface {
  /** 실제 읽기에 나타나는 표기 */
  text: string
  /** KANJIDIC 원형 (히라가나 정규화) */
  base: string
  kind: 'on' | 'kun'
  variants: VariantKind[]
  /** 원형 자체가 파생형(連用形 등)이면 붙는 비용 */
  baseCost: number
}

/** 어두 자음을 바꾼다. 바뀌지 않으면 null */
function replaceHead(s: string, table: Record<string, string | string[]>): string[] {
  const head = s[0]
  const to = table[head]
  if (to === undefined) return []
  return (Array.isArray(to) ? to : [to]).map((t) => t + s.slice(1))
}

/**
 * 한 한자가 복합어 안에서 취할 수 있는 표면형 후보를 만든다.
 * @param prevTail 직전 한자 읽기의 마지막 가나 ('' 이면 어두)
 * @param isLast 마지막 한자면 促音便이 일어날 수 없다
 */
export function surfaceCandidates(
  bases: BaseReading[],
  prevTail: string,
  isLast: boolean,
): Surface[] {
  const isHead = prevTail === ''
  const out: Surface[] = []
  const seen = new Set<string>()
  const push = (s: Surface) => {
    const key = `${s.text}\u0000${s.base}\u0000${s.kind}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(s)
  }

  for (const { text: base, kind, cost: baseCost, prefix } of bases) {
    if (base === '') continue
    // 어두 변형 — 원형 / 連濁 / 半濁 / 連声
    const heads: { text: string; variants: VariantKind[] }[] = [{ text: base, variants: [] }]
    if (!isHead) {
      for (const t of replaceHead(base, RENDAKU)) heads.push({ text: t, variants: ['rendaku'] })
    }
    if (prevTail === 'っ' || prevTail === 'ん') {
      for (const t of replaceHead(base, HANDAKU)) heads.push({ text: t, variants: ['handaku'] })
    }
    if (prevTail === 'ん') {
      for (const t of replaceHead(base, RENJO)) heads.push({ text: t, variants: ['renjo'] })
    }
    // 말미 변형 — 促音便
    for (const h of heads) {
      push({ text: h.text, base, kind, variants: h.variants, baseCost })
      if (!isLast && SOKUON_TAIL.has(h.text.at(-1)!)) {
        push({ text: h.text.slice(0, -1) + 'っ', base, kind, variants: [...h.variants, 'sokuon'], baseCost })
      }
      // 促音添加 — 접두 용법 훈독은 말미 가나가 바뀌는 대신 っ 가 덧붙는다 (真っ赤 まっか)
      else if (!isLast && prefix && h.text.at(-1) !== 'っ') {
        push({ text: h.text + 'っ', base, kind, variants: [...h.variants, 'sokuon'], baseCost })
      }
    }
  }
  return out
}

/** 直前이 促音(っ)일 때 이어질 수 있는 표면형인지 */
export function canFollowSokuon(text: string): boolean {
  return AFTER_SOKUON.has(text[0])
}

export function surfaceCost(s: Surface): number {
  return s.baseCost + s.variants.reduce((a, v) => a + VARIANT_COST[v], 0)
}

/** 훈독 원형(사전형)의 어미를 연용형으로 바꿀 때 쓰는 5단 활용 대응표 */
const IROW: Record<string, string> = {
  う: 'い', く: 'き', ぐ: 'ぎ', す: 'し', つ: 'ち', ぬ: 'に', ぶ: 'び', む: 'み', る: 'り',
}

/** 원형 후보 1개 — KANJIDIC 표기에서 유도한 읽기와 그 유도 비용 */
export interface BaseReading {
  text: string
  kind: 'on' | 'kun'
  cost: number
  /** KANJIDIC 이 접두 용법으로 표시한 읽기(ま-, おお-). 促音添加가 일어날 수 있다 */
  prefix: boolean
}

/** 파생형(連用形·형용사 어간)에 붙이는 비용. 사전에 그대로 실린 읽기보다 뒤로 밀기 위한 것 */
export const DERIVED_BASE_COST = 0.5

/**
 * KANJIDIC 읽기 문자열에서 복합어에 나타날 수 있는 원형 후보들을 뽑는다.
 * 마침표는 오쿠리가나 경계, 하이픈은 접두·접미 표시다.
 *
 * 한자만으로 쓰인 복합어는 오쿠리가나를 표기에 드러내지 않으므로 한자가 연용형 전체를 덮는다
 * (買取 = かい + とり). 그래서 어간·전체 외에 연용형 후보를 함께 만든다.
 */
export function normalizeKanjidicReading(raw: string, kind: 'on' | 'kun'): BaseReading[] {
  const noAffix = raw.replace(/-/g, '')
  const prefix = raw.endsWith('-')
  const out: BaseReading[] = []
  const seen = new Set<string>()
  const push = (text: string, cost: number) => {
    const t = toHiragana(text)
    if (t.length === 0 || seen.has(t)) return
    seen.add(t)
    out.push({ text: t, kind, cost, prefix })
  }

  push(noAffix.replace(/[.]/g, ''), 0) // 전체 (오쿠리가나 포함)
  if (kind === 'on' || !noAffix.includes('.')) return out

  const dot = noAffix.indexOf('.')
  const stem = noAffix.slice(0, dot)
  const oku = noAffix.slice(dot + 1)
  push(stem, 0) // 어간만

  const tail = oku.at(-1)!
  if (IROW[tail]) push(stem + oku.slice(0, -1) + IROW[tail], DERIVED_BASE_COST) // 5단 연용형
  if (oku.length >= 2 && (tail === 'る' || tail === 'い')) {
    push(stem + oku.slice(0, -1), DERIVED_BASE_COST) // 1단 연용형 / 형용사 어간
  }
  return out
}

// 連濁·半濁의 역방향 — 탁음/반탁음 어두를 청음으로 되돌린다
const UNVOICE: Record<string, string> = Object.fromEntries([
  ...Object.entries(RENDAKU).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => [x, k])),
  ...Object.entries(HANDAKU).map(([k, v]) => [v, k]),
])

/**
 * KANJIDIC 은 이미 탁음화된 접미형을 별도 읽기로 싣는다 (金 の -がね, 取 の -ど.り).
 * 그대로 두면 金:かね 와 金:がね 가 다른 쌍이 되어 음독 숙달 집계가 쪼개진다.
 * 같은 한자에 청음형이 함께 있으면 그쪽을 대표형으로 삼는다.
 */
export function unvoiceHead(s: string): string | null {
  const to = UNVOICE[s[0]]
  return to === undefined ? null : to + s.slice(1)
}

/** 탁음·반탁음을 전부 청음으로 되돌린다. 連濁 오답 판정에서 두 문자열을 같은 자리에 놓는 용도 */
export function unvoiceAll(s: string): string {
  let out = ''
  for (const ch of s) out += UNVOICE[ch] ?? ch
  return out
}

/**
 * 장음 표기를 걷어낸다 (ー, o·u단 뒤의 う, e·i단 뒤의 い).
 * 長音 오답(とくちょう → とくちょ) 판정에서 두 문자열을 같은 자리에 놓는 용도다.
 */
export function stripLongVowels(s: string): string {
  let out = ''
  for (const ch of s) {
    if (ch === 'ー') continue
    const prev = vowelOf(out.at(-1) ?? '')
    if (ch === 'う' && (prev === 'o' || prev === 'u')) continue
    if (ch === 'い' && (prev === 'e' || prev === 'i')) continue
    out += ch
  }
  return out
}

/**
 * っ 를 촉음便 이전 형태로 되돌린 후보들. 促音 오답(はったつ → はつたつ) 판정용이다.
 * 원형은 포함하지 않는다.
 */
export function sokuonVariants(s: string): string[] {
  const out: string[] = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== 'っ') continue
    const head = s.slice(0, i)
    const tail = s.slice(i + 1)
    out.push(head + tail) // 촉음 자체가 없는 형태 (促音添加의 역)
    for (const k of SOKUON_TAIL) out.push(head + k + tail)
  }
  return out
}
