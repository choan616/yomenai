// 읽기 오답을 6종으로 자동 판정한다 (PLAN §6). 진단 리포트의 유일한 입력원
import { decompose, type KanjiReadings, type Segment } from '../lib/onyomi.ts'
import {
  normalizeKanjidicReading,
  sokuonVariants,
  stripLongVowels,
  toHiragana,
  unvoiceAll,
} from '../lib/readings.ts'
import type { MistakeType } from './types.ts'

export interface MistakeContext {
  /** 한자 → KANJIDIC 읽기. Phase 1 산출물 kanji.json 이 원본 */
  lookup: (kanji: string) => KanjiReadings | undefined
  /**
   * 한국 한자음이 같은 *다른* 한자들의 음독 (자기 자신 제외).
   * 주지 않으면 KO_INTERFERENCE 판정을 건너뛴다.
   */
  koSiblingOnyomi?: (kanji: string) => string[]
}

export interface MistakeInput {
  headword: string
  /** 정답 읽기 (히라가나) */
  expected: string
  /** 사용자 입력. 가타카나로 들어와도 되게 안에서 히라가나로 정규화한다 */
  answer: string
}

/**
 * 분해가 성공한 경우의 판정 우선순위.
 * 구조적 오해(음훈 혼독 → 음독 선택)가 표면 음운 변형(連濁 → 促音)보다 진단 가치가 크다.
 */
const DECOMPOSED_PRIORITY: MistakeType[] = ['MIXED_READING', 'ONYOMI_CHOICE', 'RENDAKU', 'SOKUON', 'CHOON']

/**
 * `RENDAKU` 한 바구니 안에서 실제로 무엇이 달랐나 (2026-09-17).
 *
 * 분류기는 소리가 탁해지는 세 현상을 한 유형으로 묶는다 — 진단 축으로는 그게 맞지만,
 * **학습자에게 보여줄 규칙은 셋이 다르다.** 出発을 しゅつはつ 로 쓴 사람에게 필요한 건
 * 연탁 설명이 아니라 반탁 설명이다.
 *
 * 이벤트에는 저장하지 않는다 (`mistakeType` 은 스키마 불변 조건, CLAUDE.md). 대신
 * 저장된 `answer`·`expected` 로 언제든 다시 매길 수 있다 — 지난 기록에도 소급된다.
 */
export type VoicingKind = 'rendaku' | 'renjo' | 'handaku'

export interface MistakeVerdict {
  type: MistakeType | null
  /** `type === 'RENDAKU'` 일 때만 채워진다 */
  voicing: VoicingKind | null
}

/**
 * 오답 유형을 판정한다. 정답이거나 어느 유형에도 해당하지 않으면 null.
 *
 * 두 경로로 나뉜다.
 * 1. **답이 일본어로 파싱되는 경우** — 정답 분해와 자리별로 비교한다. 이때 답의 모든 조각이
 *    해당 한자의 실재 읽기이므로 KO_INTERFERENCE 는 후보가 아니다
 *    (発端 → はつたん 은 発 자신의 음독을 고른 것이라 ONYOMI_CHOICE. PLAN §6 표와 같다)
 * 2. **파싱되지 않는 경우** — 문자열 관계로 連濁·促音·長音을 먼저 본다. 셋 다 한 축만 다른
 *    엄밀한 동치라 오탐이 거의 없다. 그다음에야 KO_INTERFERENCE 를 본다
 */
export function classifyMistake(input: MistakeInput, ctx: MistakeContext): MistakeType | null {
  return explainMistake(input, ctx).type
}

/** `classifyMistake` 와 같은 판정에 **어느 갈래였는지**를 얹어 돌려준다 */
export function explainMistake(input: MistakeInput, ctx: MistakeContext): MistakeVerdict {
  const expected = toHiragana(input.expected.trim())
  const answer = toHiragana(input.answer.trim())
  if (answer === '' || answer === expected) return NO_MISTAKE

  const exp = decompose(input.headword, expected, ctx.lookup)
  if (exp.ok) {
    const ans = decompose(input.headword, answer, ctx.lookup)
    if (ans.ok && ans.segments.length === exp.segments.length) {
      return fromSegments(exp.segments, ans.segments)
    }
  }
  return fromStrings(input.headword, expected, answer, ctx, exp.ok ? exp.segments : null)
}

const NO_MISTAKE: MistakeVerdict = { type: null, voicing: null }
const verdict = (type: MistakeType | null, voicing: VoicingKind | null = null): MistakeVerdict => ({
  type,
  voicing: type === 'RENDAKU' ? voicing : null,
})

/** 자리별로 정답 조각과 오답 조각을 비교해 후보를 모으고 우선순위로 하나 고른다 */
function fromSegments(expected: Segment[], answer: Segment[]): MistakeVerdict {
  const found = new Set<MistakeType>()
  /** 탁음 갈래는 **처음 어긋난 자리**의 것을 쓴다. 앞자리가 뒤를 끌고 가므로 */
  let voicing: VoicingKind | null = null
  let prevDiffered = false
  for (let i = 0; i < expected.length; i++) {
    const e = expected[i]
    const a = answer[i]
    const differs = (v: string) => e.variants.includes(v) !== a.variants.includes(v)
    if (e.surface === a.surface) {
      prevDiffered = false
      continue
    }

    if (e.kind !== a.kind) found.add('MIXED_READING')
    else if (e.base !== a.base) {
      // 원형이 장음 유무로만 갈리면(すう ↔ す) 다른 음독을 고른 게 아니라 장음을 흘린 것이다.
      // 우연히 짧은 쪽도 실재 음독인 경우가 있어(数 의 ス) 분해만으로는 구분되지 않는다
      found.add(stripLongVowels(e.base) === stripLongVowels(a.base) ? 'CHOON' : 'ONYOMI_CHOICE')
    } else if (differs('rendaku') || differs('renjo')) {
      found.add('RENDAKU')
      voicing ??= differs('rendaku') ? 'rendaku' : 'renjo'
    } else if (differs('handaku')) {
      // 半濁音은 っ·ん 뒤에서만 일어난다. 앞 자리가 이미 틀렸으면 이건 그 결과이지 별개 오답이 아니다
      // (発表 はっぴょう → はつひょう 의 원인은 促音便 미적용 하나다)
      if (!prevDiffered) {
        found.add('RENDAKU')
        voicing ??= 'handaku'
      }
    } else if (differs('sokuon')) found.add('SOKUON')
    prevDiffered = true
  }
  return verdict(DECOMPOSED_PRIORITY.find((t) => found.has(t)) ?? null, voicing)
}

/** 분해가 안 되는 답 — 문자열 관계와 한국 한자음 간섭을 본다 */
function fromStrings(
  headword: string,
  expected: string,
  answer: string,
  ctx: MistakeContext,
  /** 정답 쪽 분해. 탁음 차이가 *실제 변형*인지 가리는 데 쓴다 */
  expSegments: Segment[] | null,
): MistakeVerdict {
  if (unvoiceAll(expected) === unvoiceAll(answer)) {
    const voicing = stringVoicing(expected, answer, expSegments)
    if (voicing !== null) return verdict('RENDAKU', voicing)
  }
  if (sokuonVariants(expected).includes(answer) || sokuonVariants(answer).includes(expected)) {
    return verdict('SOKUON')
  }
  if (stripLongVowels(expected) === stripLongVowels(answer)) return verdict('CHOON')
  return verdict(koInterference(headword, answer, ctx) ? 'KO_INTERFERENCE' : null)
}

const HANDAKU_ROW = 'ぱぴぷぺぽ'
const SEION_ROW = 'はひふへほ'

/** 정답 조각에 붙어 있으면 「소리가 탁해지는 변형이 실제로 걸렸다」는 표식 */
const VOICING_VARIANTS = ['rendaku', 'renjo', 'handaku']

/**
 * 표면 `index` 자리를 덮는 정답 조각에 탁음 변형이 걸려 있나.
 *
 * 정답 쪽이 분해에 실패하면(드묾) 가릴 근거가 없으니 `true` 로 둔다. 근거 없이 판정을
 * 없애는 것보다, 문자열 관계만 보던 기존 판정을 남기는 쪽이 잃는 게 적다.
 */
function voicedAt(segments: Segment[] | null, index: number): boolean {
  if (segments === null) return true
  let end = 0
  for (const s of segments) {
    end += s.surface.length
    if (index < end) return s.variants.some((v) => VOICING_VARIANTS.includes(v))
  }
  return false
}

/**
 * 분해가 안 되는 답의 탁음 갈래. `unvoiceAll` 이 같다는 건 자리 수가 같다는 뜻이라
 * 처음 어긋난 자리만 본다. は행 ↔ ぱ행이면 반탁, 아니면 연탁이다.
 *
 * **정답 쪽에 변형이 안 걸린 자리면 `null`** — 탁음이 어긋났다고 다 연탁이 아니다.
 * 月額 げつがく 의 額는 원형이 がく 고 청음 かく 가 없다. げつかく 는 연탁을 놓친 답이
 * 아니라 원형을 잘못 안 답이다. 여기에 연탁 규칙을 붙이면 엉뚱한 절을 가르친다.
 * 어긋난 자리가 여럿이면 처음 자리로 판단한다 — `fromSegments` 와 같은 규약이다.
 *
 * 연성(ん + 모음 → な행)은 여기 안 온다 — の 와 お 는 청탁 짝이 아니라 `unvoiceAll` 이
 * 같아지지 않는다. 분해 경로에서만 잡힌다.
 */
function stringVoicing(
  expected: string,
  answer: string,
  expSegments: Segment[] | null,
): VoicingKind | null {
  for (let i = 0; i < Math.min(expected.length, answer.length); i++) {
    if (expected[i] === answer[i]) continue
    if (!voicedAt(expSegments, i)) return null
    const pair = expected[i] + answer[i]
    const handaku = [...pair].some((c) => HANDAKU_ROW.includes(c))
    const seion = [...pair].some((c) => SEION_ROW.includes(c))
    return handaku && seion ? 'handaku' : 'rendaku'
  }
  return null
}

/**
 * 한국 한자음 간섭 — "이 한자는 한국음이 X니까 일본음도 X 계열이겠지"에서 나오는 오답.
 *
 * 판정 방법은 읽기 표를 넓혀 다시 분해해보는 것이다. 각 한자에 *한국음이 같은 다른 한자들의
 * 음독*을 얹은 뒤 답이 그제서야 분해되고, 그 조각이 자기 한자의 읽기가 아니면 간섭으로 본다.
 * 認識 → にんしょく 에서 しょく 는 食·植(둘 다 한국음 식)의 음독이지 識의 읽기가 아니다.
 *
 * 자기 한자의 다른 음독을 고른 경우는 여기 오지 않는다. 그건 위쪽 분해 경로에서
 * ONYOMI_CHOICE 로 이미 잡힌다.
 */
function koInterference(headword: string, answer: string, ctx: MistakeContext): boolean {
  const sibling = ctx.koSiblingOnyomi
  if (!sibling) return false

  const own = new Map<string, Set<string>>()
  const ownBases = (kanji: string): Set<string> => {
    let set = own.get(kanji)
    if (set === undefined) {
      set = new Set<string>()
      const rec = ctx.lookup(kanji)
      for (const [kind, raws] of [['on', rec?.onyomi ?? []], ['kun', rec?.kunyomi ?? []]] as const) {
        for (const raw of raws) {
          for (const b of normalizeKanjidicReading(raw, kind)) set.add(b.text)
        }
      }
      own.set(kanji, set)
    }
    return set
  }

  const widened = decompose(headword, answer, (kanji) => {
    const rec = ctx.lookup(kanji)
    if (!rec) return undefined
    return { onyomi: [...rec.onyomi, ...sibling(kanji)], kunyomi: rec.kunyomi }
  })
  if (!widened.ok) return false
  return widened.segments.some((s) => !ownBases(s.kanji).has(s.base))
}

/**
 * 한국 한자음 → 그 음을 쓰는 한자들의 음독 색인을 만든다.
 * `kanji.json` 전체를 한 번 훑으면 되고, 결과는 자기 한자를 뺀 음독 목록을 돌려준다.
 */
export function buildKoSiblingIndex(
  kanji: Record<string, { koreanH: string[]; onyomi: string[] }>,
): (kanji: string) => string[] {
  const bySound = new Map<string, Set<string>>()
  for (const rec of Object.values(kanji)) {
    for (const sound of rec.koreanH) {
      let set = bySound.get(sound)
      if (set === undefined) bySound.set(sound, (set = new Set()))
      for (const on of rec.onyomi) set.add(on)
    }
  }
  const cache = new Map<string, string[]>()
  return (ch: string): string[] => {
    let hit = cache.get(ch)
    if (hit !== undefined) return hit
    const rec = kanji[ch]
    const own = new Set(rec?.onyomi ?? [])
    const out = new Set<string>()
    for (const sound of rec?.koreanH ?? []) {
      for (const on of bySound.get(sound) ?? []) if (!own.has(on)) out.add(on)
    }
    cache.set(ch, (hit = [...out]))
    return hit
  }
}
