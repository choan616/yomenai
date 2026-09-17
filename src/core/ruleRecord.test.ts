// 규칙 절에 붙는 오답 기록 파생 검증 — 절 조건별 합산, 정렬, 지워진 이벤트·미분류 제외
import { describe, expect, it } from 'vitest'
import { classifiedMistakes, mistakeOfIdiom, ruleRecord, voicingByEvent } from './ruleRecord.ts'
import { buildKoSiblingIndex, type MistakeContext, type VoicingKind } from './mistakes.ts'
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

describe('voicingByEvent', () => {
  it('저장된 답으로 연탁·반탁을 갈라 매긴다 — 이벤트에는 갈래가 없다', () => {
    const rendaku = ev('1', 'RENDAKU') // 三日月 みかつき
    const han = handaku('5')
    const map = voicingByEvent([rendaku, han], ctx, headwordOf)
    expect(map.get(rendaku.id)).toBe('rendaku')
    expect(map.get(han.id)).toBe('handaku')
  })

  it('RENDAKU 가 아니거나 이름을 모르는 숙어는 안 매긴다', () => {
    const sokuon = ev('3', 'SOKUON')
    const unknown = ev('9', 'RENDAKU')
    const map = voicingByEvent([sokuon, unknown], ctx, headwordOf)
    expect(map.size).toBe(0)
  })

  it('갈래를 못 가리면 연탁으로 둔다 — 어느 절에도 안 들어가는 것보다 낫다', () => {
    const odd = ev('2', 'RENDAKU', { expected: 'てがみ', answer: 'てがみ' })
    expect(voicingByEvent([odd], { lookup: () => undefined }, headwordOf).get(odd.id)).toBe('rendaku')
  })
})

describe('mistakeOfIdiom', () => {
  const voicing = (es: ReviewEvent[]) => voicingByEvent(es, ctx, headwordOf)

  it('제일 자주 낸 갈래를 대표로 고른다', () => {
    const es = [ev('3', 'SOKUON'), ev('3', 'SOKUON'), ev('3', 'CHOON')]
    expect(mistakeOfIdiom(es, new Map())).toEqual(
      new Map([['3', { type: 'SOKUON', voicing: null, wrong: 2 }]]),
    )
  })

  it('같은 RENDAKU 라도 연탁과 반탁은 따로 센다 — 읽을 절이 다르다', () => {
    const es = [handaku('5'), handaku('5'), ev('5', 'RENDAKU', { answer: 'みかつき' })]
    const got = mistakeOfIdiom(es, voicing(es)).get('5')
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
    const got = mistakeOfIdiom([ev('1', 'RENDAKU')], new Map<string, VoicingKind>()).get('1')
    expect(got).toEqual({ type: 'RENDAKU', voicing: null, wrong: 1 })
  })
})
