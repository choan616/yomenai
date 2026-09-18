// 규칙 절에 붙는 오답 기록 파생 검증 — 절 조건별 합산, 정렬, 지워진 이벤트·미분류 제외
import { describe, expect, it } from 'vitest'
import {
  classifiedMistakes,
  effectiveMistake,
  dominantVoicing,
  mistakeOfIdiom,
  reclassifier,
  ruleRecord,
  verdictByEvent,
  voicingCounts,
} from './ruleRecord.ts'
import { buildKoSiblingIndex, type MistakeContext } from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import type { LearningEvent, MistakeType, ReviewEvent } from './types.ts'

let seq = 0
function ev(
  idiomId: string,
  mistakeType: MistakeType | null,
  over: Partial<ReviewEvent> = {},
): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(3, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at: 1_700_000_000_000 + seq,
    idiomId,
    cardType: 'reading',
    mistakeType,
    deletedAt: null,
    type: 'review',
    grade: 1,
    answer: 'みかつき',
    expected: 'みかづき',
    correct: false,
    elapsedMs: 1000,
    ...over,
  }
}

const names: Record<string, { headword: string; reading: string }> = {
  '1': { headword: '三日月', reading: 'みかづき' },
  '2': { headword: '手紙', reading: 'てがみ' },
  '3': { headword: '学校', reading: 'がっこう' },
  '4': { headword: '認識', reading: 'にんしき' },
  '5': { headword: '心配', reading: 'しんぱい' },
  // 고치기 전 분류기가 RENDAKU 로 저장했지만 額는 원형이 がく 다 (2026-09-17)
  '6': { headword: '月額', reading: 'げつがく' },
}
const nameOf = (id: string) => names[id]
const isType = (t: MistakeType) => (e: ReviewEvent) => e.mistakeType === t

describe('classifiedMistakes', () => {
  it('유형이 붙은 읽기 오답만 남긴다', () => {
    const events: LearningEvent[] = [
      ev('1', 'RENDAKU'),
      ev('4', null), // 미분류 오답 — 어느 절에도 안 간다
      ev('1', 'RENDAKU', { deletedAt: 1_700_000_100_000 }), // 지워진 이벤트
      ev('3', 'SOKUON', { cardType: 'meaning' }), // 뜻 카드
      {
        id: 'k1',
        userId: 'local',
        deviceId: 'dev',
        at: 1,
        idiomId: '2',
        cardType: 'meaning',
        mistakeType: null,
        deletedAt: null,
        type: 'meaningKnown',
        known: true,
      },
    ]
    expect(classifiedMistakes(events).map((e) => e.idiomId)).toEqual(['1'])
  })
})

describe('ruleRecord', () => {
  const events = classifiedMistakes([
    ev('1', 'RENDAKU'),
    ev('1', 'RENDAKU'),
    ev('1', 'RENDAKU'),
    ev('2', 'RENDAKU'),
    ev('3', 'SOKUON'),
    ev('3', 'SOKUON'),
    ev('9', 'RENDAKU'), // 이름을 모르는 숙어
  ])

  it('절 조건에 맞는 오답을 센다', () => {
    expect(ruleRecord(events, isType('RENDAKU'), nameOf).count).toBe(5)
    expect(ruleRecord(events, isType('SOKUON'), nameOf).count).toBe(2)
  })

  it('많이 틀린 순으로 세우고 이름을 모르는 숙어는 목록에서 뺀다', () => {
    const r = ruleRecord(events, isType('RENDAKU'), nameOf)
    expect(r.idioms.map((i) => i.headword)).toEqual(['三日月', '手紙'])
    expect(r.idioms[0].wrong).toBe(3)
  })

  it('갈래까지 보는 절은 그 갈래만 센다 — 세 절이 같은 숫자를 보이면 안 된다', () => {
    const handaku = (e: ReviewEvent) => e.mistakeType === 'RENDAKU' && e.expected === 'しんぱい'
    const mixed = classifiedMistakes([
      ev('1', 'RENDAKU'),
      ev('5', 'RENDAKU', { expected: 'しんぱい', answer: 'しんはい' }),
      ev('5', 'RENDAKU', { expected: 'しんぱい', answer: 'しんはい' }),
    ])
    expect(ruleRecord(mixed, handaku, nameOf).count).toBe(2)
    expect(ruleRecord(mixed, (e) => !handaku(e), nameOf).count).toBe(1)
  })

  it('기록이 없으면 0 과 빈 목록이다', () => {
    expect(ruleRecord(events, isType('CHOON'), nameOf)).toEqual({ count: 0, idioms: [] })
  })

  it('상한을 넘으면 목록만 자른다 — 횟수는 안 깎인다', () => {
    const r = ruleRecord(events, isType('RENDAKU'), nameOf, 1)
    expect(r.idioms).toHaveLength(1)
    expect(r.count).toBe(5)
  })
})

// 배지가 가리킬 갈래·대표 오답 (2026-09-17)
const ctx: MistakeContext = {
  lookup: (k) => KANJI_FIXTURE[k],
  koSiblingOnyomi: buildKoSiblingIndex(KANJI_FIXTURE),
}
const headwordOf = (id: string) => names[id]?.headword
/** 반탁 오답 한 건 — 心配 を しんはい */
const handaku = (idiomId: string, over: Partial<ReviewEvent> = {}) =>
  ev(idiomId, 'RENDAKU', { expected: 'しんぱい', answer: 'しんはい', ...over })

describe('verdictByEvent', () => {
  it('저장된 답으로 연탁·반탁을 갈라 매긴다 — 이벤트에는 갈래가 없다', () => {
    const rendaku = ev('1', 'RENDAKU') // 三日月 みかつき
    const han = handaku('5')
    const map = verdictByEvent([rendaku, han], ctx, headwordOf)
    expect(map.get(rendaku.id)).toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
    expect(map.get(han.id)).toEqual({ type: 'RENDAKU', voicing: 'handaku' })
  })

  it('RENDAKU 가 아니거나 이름을 모르는 숙어는 안 매긴다', () => {
    const sokuon = ev('3', 'SOKUON')
    const unknown = ev('9', 'RENDAKU')
    const map = verdictByEvent([sokuon, unknown], ctx, headwordOf)
    expect(map.size).toBe(0)
  })

  it('사전을 못 읽으면 저장된 판정을 남긴다 — 근거 없이 지우지 않는다', () => {
    const odd = ev('1', 'RENDAKU')
    expect(verdictByEvent([odd], { lookup: () => undefined }, headwordOf).get(odd.id))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })

  it('지금 분류기가 연탁이 아니라고 하면 그대로 돌려준다 — 月額 げつがく ← げつかく', () => {
    const stale = ev('6', 'RENDAKU', { expected: 'げつがく', answer: 'げつかく' })
    expect(verdictByEvent([stale], ctx, headwordOf).get(stale.id))
      .toEqual({ type: null, voicing: null })
  })
})

describe('mistakeOfIdiom', () => {
  const verdicts = (es: ReviewEvent[]) => verdictByEvent(es, ctx, headwordOf)

  it('제일 자주 낸 갈래를 대표로 고른다', () => {
    const es = [ev('3', 'SOKUON'), ev('3', 'SOKUON'), ev('3', 'CHOON')]
    expect(mistakeOfIdiom(es, new Map())).toEqual(
      new Map([['3', { type: 'SOKUON', voicing: null, wrong: 2 }]]),
    )
  })

  it('같은 RENDAKU 라도 연탁과 반탁은 따로 센다 — 읽을 절이 다르다', () => {
    const es = [handaku('5'), handaku('5'), ev('5', 'RENDAKU', { answer: 'みかつき' })]
    const got = mistakeOfIdiom(es, verdicts(es)).get('5')
    expect(got).toEqual({ type: 'RENDAKU', voicing: 'handaku', wrong: 2 })
  })

  it('동점이면 최근 것 — 지금 상태에 가까운 쪽을 보여준다', () => {
    const old = ev('3', 'CHOON', { at: 1_000 })
    const recent = ev('3', 'SOKUON', { at: 9_000 })
    expect(mistakeOfIdiom([old, recent], new Map()).get('3')?.type).toBe('SOKUON')
    // 순서를 뒤집어도 같은 답이다 (이벤트 배열 순서에 안 휘둘린다)
    expect(mistakeOfIdiom([recent, old], new Map()).get('3')?.type).toBe('SOKUON')
  })

  it('유형이 없는 오답은 대표가 안 된다', () => {
    expect(mistakeOfIdiom([ev('1', null)], new Map()).size).toBe(0)
  })

  it('갈래를 모르는 RENDAKU 는 voicing 이 비어 온다 — 배지는 대표 절(연탁)로 간다', () => {
    const got = mistakeOfIdiom([ev('1', 'RENDAKU')], new Map()).get('1')
    expect(got).toEqual({ type: 'RENDAKU', voicing: null, wrong: 1 })
  })
})

/**
 * 지난 이벤트의 **유형**까지 다시 매긴다 (2026-09-17, 사용자 지적 「絶好는 촉음 아닌가」).
 *
 * 처음엔 갈래만 다시 매기고 유형은 저장값을 썼다. 분류기를 고쳐도 **지난 기록의 배지는
 * 그대로 연탁**이었다. 저장값은 못 고치니(스키마 불변 조건) 읽을 때 다시 매긴다.
 */
describe('지난 RENDAKU 이벤트를 지금 분류기로 다시 읽는다', () => {
  const stale = () => ev('6', 'RENDAKU', { expected: 'げつがく', answer: 'げつかく' })

  it('배지가 더는 연탁이 아니다 — 대표 오답에서 빠진다', () => {
    const e = stale()
    expect(mistakeOfIdiom([e], verdictByEvent([e], ctx, headwordOf)).size).toBe(0)
  })

  it('절 색인에서도 빠진다', () => {
    const e = stale()
    const verdictOf = verdictByEvent([e], ctx, headwordOf)
    const match = (x: ReviewEvent) => effectiveMistake(x, verdictOf)?.type === 'RENDAKU'
    expect(ruleRecord([e], match, nameOf).count).toBe(0)
  })

  it('진짜 연탁은 그대로 남는다 — 三日月 みかづき ← みかつき', () => {
    const e = ev('1', 'RENDAKU')
    const verdictOf = verdictByEvent([e], ctx, headwordOf)
    expect(effectiveMistake(e, verdictOf)).toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })

  it('RENDAKU 가 아닌 유형은 저장값을 그대로 쓴다 — 다시 안 매긴다', () => {
    const e = ev('3', 'SOKUON')
    expect(effectiveMistake(e, new Map())).toEqual({ type: 'SOKUON', voicing: null })
  })
})

/**
 * 다시 매기는 자리는 하나다 (2026-09-17, 노출 경로 일관성).
 *
 * 규칙 화면·다시보기는 `verdictByEvent` 로, 리포트는 `replay` 의 `mistakeOf` 로 들어오는데
 * 둘 다 `reclassifier` 를 지난다. 두 곳에서 따로 매기면 리포트와 규칙 화면이 갈라진다 —
 * 실제로 갈라져 있었다 (ee521b0 이 규칙 화면만 고쳤다).
 */
describe('reclassifier — 리포트와 규칙 화면이 같은 함수를 쓴다', () => {
  const again = reclassifier(ctx, headwordOf)
  const stale = ev('6', 'RENDAKU', { expected: 'げつがく', answer: 'げつかく' })

  it('지난 RENDAKU 를 다시 매긴 결과가 verdictByEvent 와 같다', () => {
    expect(again(stale)).toEqual(verdictByEvent([stale], ctx, headwordOf).get(stale.id))
  })

  it('月額 은 어느 유형도 아니게 된다 — 리포트에서도 빠진다', () => {
    expect(again(stale).type).toBeNull()
  })

  it('RENDAKU 가 아닌 유형은 저장값을 그대로 돌려준다', () => {
    expect(again(ev('3', 'SOKUON'))).toEqual({ type: 'SOKUON', voicing: null })
  })

  it('숙어를 모르면 저장값을 남긴다 — 근거 없이 바꾸지 않는다', () => {
    expect(again(ev('9', 'RENDAKU'))).toEqual({ type: 'RENDAKU', voicing: null })
  })
})

/**
 * 분포는 갈래로 나누고 처방 문턱은 묶은 채로 (2026-09-17, 노출 경로 일관성).
 *
 * 리포트가 「연탁 5회」 한 칸만 보여줘서, 반탁만 틀린 사람도 「연탁」이라는 이름을 받고
 * 있었다 — 탁음 오답의 26%가 반탁이다. **표시 축과 판정 축은 다르다.**
 */
describe('voicingCounts — 탁음 바구니를 갈래로 센다', () => {
  const again = reclassifier(ctx, headwordOf)

  it('연탁과 반탁을 따로 센다', () => {
    const es = [ev('1', 'RENDAKU'), handaku('5'), handaku('5')]
    expect(voicingCounts(es, again)).toEqual({ rendaku: 1, handaku: 2, renjo: 0, unmarked: 0 })
  })

  it('다시 매겨 연탁이 아니게 된 것은 안 센다 — 리포트 분포에서도 빠진다', () => {
    const stale = ev('6', 'RENDAKU', { expected: 'げつがく', answer: 'げつかく' })
    expect(voicingCounts([stale], again)).toEqual({ rendaku: 0, handaku: 0, renjo: 0, unmarked: 0 })
  })

  it('탁음이 아닌 유형은 안 센다', () => {
    expect(voicingCounts([ev('3', 'SOKUON')], again)).toEqual({
      rendaku: 0,
      handaku: 0,
      renjo: 0,
      unmarked: 0,
    })
  })

  it('제일 많은 갈래를 고른다 — 처방이 읽힐 절을 정한다', () => {
    expect(dominantVoicing({ rendaku: 1, handaku: 2, renjo: 0, unmarked: 0 })).toBe('handaku')
    // 동점이면 대표 절
    expect(dominantVoicing({ rendaku: 2, handaku: 2, renjo: 0, unmarked: 0 })).toBe('rendaku')
    expect(dominantVoicing({ rendaku: 0, handaku: 0, renjo: 0, unmarked: 0 })).toBeNull()
    expect(dominantVoicing({ rendaku: 0, handaku: 0, renjo: 0, unmarked: 3 })).toBe('unmarked')
  })
})
