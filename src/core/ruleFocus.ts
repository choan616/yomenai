// 대조 세션의 표적을 그 규칙이 실제로 건 (한자,음독) 쌍으로 좁힌다 (2026-10-07, 교수자 관점 보완 9단계)
//
// 6단계는 그 절로 틀린 숙어의 pairIds 를 전부 합집합으로 모았다 — 発達 을 촉음으로 틀리면
// 発:on:はつ 와 함께 達:on:たつ 까지 표적이 돼, 촉음과 무관한 達成·到達 이 세션에 섞였다.
// 정답 읽기를 decompose 하면 조각마다 variants 가 붙으므로, 그 변형을 실제로 든 조각의
// pairId 만 추리면 경계가 더 또렷해진다.
import { decompose, pairId, type KanjiReadings } from '../lib/onyomi.ts'
import type { MeasuredVariant } from './firstTry.ts'
import type { VoicingKind } from './mistakes.ts'
import type { MistakeType } from './types.ts'

/** 그 절로 틀린 숙어 하나 — 좁히려면 표기·읽기가 있어야 `decompose` 를 다시 돌릴 수 있다 */
export interface RuleFocusIdiom {
  idiomId: string
  headword: string
  reading: string
  pairIds: string[]
}

/**
 * 처방 유형(+탁음 갈래)이 `decompose` 의 네 변형 중 무엇에 대응되나.
 * 대응이 없으면 null — `CHOON`·`ONYOMI_CHOICE`·`KO_INTERFERENCE`·`MIXED_READING` 과
 * 청탁 미구분(`voicing === 'unmarked'`)이 여기 온다. `variants` 에 표시가 없어 좁힐 근거가 없다.
 */
function measuredVariantOfMistake(type: MistakeType, voicing: VoicingKind | null): MeasuredVariant | null {
  if (type === 'SOKUON') return 'sokuon'
  if (type === 'RENDAKU' && (voicing === 'rendaku' || voicing === 'renjo' || voicing === 'handaku')) {
    return voicing
  }
  return null
}

/**
 * 대조 세션의 표적 쌍. 좁힐 근거가 없거나 좁혀서 비면 합집합으로 돌아간다.
 *
 * 빈 표적으로 떨어지는 쪽이 더 나쁘다 — 버튼이 사라지는데, 틀린 기록이 있는데 갈 데가 없는
 * 것보다는 밀도가 떨어지는 합집합이 낫다. 분해가 실패하는 숙어가 섞여도(드묾) 그 숙어만
 * 건너뛰고 나머지 표적은 살아 있다.
 */
export function ruleFocusPairs(input: {
  /** 그 절로 틀린 숙어들 */
  idioms: RuleFocusIdiom[]
  type: MistakeType
  /** `type === 'RENDAKU'` 일 때만 쓴다. `dominantVoicing` 이 정한 값을 그대로 받는다 */
  voicing: VoicingKind | null
  lookup: (kanji: string) => KanjiReadings | undefined
}): string[] {
  const union = new Set<string>()
  for (const idiom of input.idioms) {
    for (const pid of idiom.pairIds) union.add(pid)
  }

  const variant = measuredVariantOfMistake(input.type, input.voicing)
  if (variant === null) return [...union]

  const narrowed = new Set<string>()
  for (const idiom of input.idioms) {
    const d = decompose(idiom.headword, idiom.reading, input.lookup)
    if (!d.ok) continue
    for (const seg of d.segments) {
      if (seg.variants.includes(variant)) narrowed.add(pairId(seg.kanji, seg.base, seg.kind))
    }
  }
  return narrowed.size > 0 ? [...narrowed] : [...union]
}
