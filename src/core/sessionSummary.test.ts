// 세션 종료 요약과 "오늘의 발견" 선택 규칙 검증
import { describe, expect, it } from 'vitest'
import {
  buildSessionSummary,
  groupSessions,
  SESSION_GAP_MS,
  type SummaryInput,
} from './sessionSummary.ts'
import { newEventId, type LearningEvent, type MistakeType, type ReviewEvent } from './types.ts'
import type { OnyomiPair } from '../dict/load.ts'

const T0 = Date.UTC(2026, 0, 1)
const DAY = 86_400_000

let seq = 0
function ev(fields: Partial<ReviewEvent> & { at: number; idiomId: string }): ReviewEvent {
  seq++
  return {
    id: newEventId(fields.at, () => ((seq * 13) % 36) / 36),
    userId: 'local',
    deviceId: 'dev',
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: 3,
    answer: '',
    expected: '',
    correct: true,
    elapsedMs: 1000,
    ...fields,
  }
}

/** 한 세션치 이벤트 — 12초 간격이라 같은 그룹으로 묶인다 */
function session(at: number, specs: (Partial<ReviewEvent> & { idiomId: string })[]): ReviewEvent[] {
  return specs.map((s, i) => ev({ ...s, at: at + i * 12_000 }))
}

const PAIRS = new Map<string, OnyomiPair>([
  ['発:on:はつ', { kanji: '発', base: 'はつ', kind: 'on' }],
  ['達:on:たつ', { kanji: '達', base: 'たつ', kind: 'on' }],
  ['学:on:がく', { kanji: '学', base: 'がく', kind: 'on' }],
])
const PAIRS_OF: Record<string, string[]> = {
  a: ['発:on:はつ', '達:on:たつ'],
  b: ['学:on:がく'],
}
const UNLOCKS: Record<string, number> = { '発:on:はつ': 23, '達:on:たつ': 5, '学:on:がく': 9 }

function input(prior: LearningEvent[], sess: LearningEvent[]): SummaryInput {
  return {
    prior,
    session: sess,
    pairsOf: (id) => PAIRS_OF[id] ?? [],
    pairs: PAIRS,
    nameOf: (id) => (id === 'a' ? { headword: '発達', reading: 'はったつ' } : undefined),
    unlocksOf: (p) => UNLOCKS[p] ?? 0,
  }
}

describe('groupSessions — 시간 간격으로 자른다', () => {
  it('간격이 좁으면 한 세션', () => {
    const s = session(T0, [{ idiomId: 'a' }, { idiomId: 'b' }, { idiomId: 'a' }])
    expect(groupSessions(s)).toHaveLength(1)
  })

  it('간격이 벌어지면 나뉜다', () => {
    const s = [...session(T0, [{ idiomId: 'a' }]), ...session(T0 + DAY, [{ idiomId: 'b' }])]
    expect(groupSessions(s)).toHaveLength(2)
  })

  it('경계값 — 정확히 SESSION_GAP_MS 면 아직 같은 세션', () => {
    const s = [ev({ at: T0, idiomId: 'a' }), ev({ at: T0 + SESSION_GAP_MS, idiomId: 'b' })]
    expect(groupSessions(s)).toHaveLength(1)
    const t = [ev({ at: T0, idiomId: 'a' }), ev({ at: T0 + SESSION_GAP_MS + 1, idiomId: 'b' })]
    expect(groupSessions(t)).toHaveLength(2)
  })

  it('묘비는 빼고, 순서가 섞여 들어와도 시간순으로 자른다', () => {
    const s = [
      ev({ at: T0 + DAY, idiomId: 'b' }),
      ev({ at: T0, idiomId: 'a' }),
      ev({ at: T0 + 60_000, idiomId: 'a', deletedAt: T0 + DAY }),
    ]
    const g = groupSessions(s)
    expect(g).toHaveLength(2)
    expect(g[0]).toHaveLength(1)
  })
})

describe('buildSessionSummary — 기본 수치', () => {
  it('정오답 수를 센다', () => {
    const s = session(T0, [
      { idiomId: 'a' },
      { idiomId: 'b', correct: false, mistakeType: 'SOKUON' },
      { idiomId: 'a' },
    ])
    const r = buildSessionSummary(input([], s))
    expect(r.total).toBe(3)
    expect(r.correct).toBe(2)
  })

  it('최다 오답 유형을 고른다', () => {
    const s = session(T0, [
      { idiomId: 'a', correct: false, mistakeType: 'SOKUON' },
      { idiomId: 'b', correct: false, mistakeType: 'SOKUON' },
      { idiomId: 'a', correct: false, mistakeType: 'CHOON' },
    ])
    expect(buildSessionSummary(input([], s)).topMistake).toEqual({ type: 'SOKUON', count: 2 })
  })

  it('오답이 없으면 최다 유형도 추이도 없다', () => {
    const r = buildSessionSummary(input([], session(T0, [{ idiomId: 'a' }])))
    expect(r.topMistake).toBeNull()
    expect(r.trend).toEqual([])
  })

  it('이번 세션에 처음 맞힌 음독만 센다', () => {
    // 이전 세션에서 a 를 틀렸다 — 発·達 은 아직 정답 0회
    const prior = session(T0, [{ idiomId: 'a', correct: false, mistakeType: 'SOKUON' }])
    // 이번 세션에서 a 를 맞히면 発·達 둘이 새로 뚫린다
    const sess = session(T0 + DAY, [{ idiomId: 'a' }])
    expect(buildSessionSummary(input(prior, sess)).newPairs).toBe(2)
  })

  it('이미 맞힌 적 있는 음독은 새로 세지 않는다', () => {
    const prior = session(T0, [{ idiomId: 'a' }])
    const sess = session(T0 + DAY, [{ idiomId: 'a' }])
    expect(buildSessionSummary(input(prior, sess)).newPairs).toBe(0)
  })
})

describe('오늘의 발견 — 우선순위', () => {
  it('전부 맞히면 CLEAN_RUN 이 최우선', () => {
    const prior = session(T0, [{ idiomId: 'a' }]) // 発·達 이미 뚫림
    const sess = session(T0 + DAY, [{ idiomId: 'a' }, { idiomId: 'a' }])
    expect(buildSessionSummary(input(prior, sess)).finding).toEqual({ kind: 'CLEAN_RUN', total: 2 })
  })

  it('오답 유형이 3세션 연속 줄면 MISTAKE_TREND down', () => {
    const wrong = (n: number, at: number) =>
      session(at, Array.from({ length: n }, () => ({
        idiomId: 'b', correct: false, mistakeType: 'SOKUON' as MistakeType,
      })))
    const prior = [...wrong(3, T0), ...wrong(2, T0 + DAY)]
    const sess = wrong(1, T0 + 2 * DAY)
    const r = buildSessionSummary(input(prior, sess))
    expect(r.trend).toEqual([3, 2, 1])
    expect(r.finding).toEqual({
      kind: 'MISTAKE_TREND', type: 'SOKUON', direction: 'down', sessions: 3,
    })
  })

  it('세션이 3회 미만이면 추이를 말하지 않는다', () => {
    const prior = session(T0, [{ idiomId: 'b', correct: false, mistakeType: 'SOKUON' }])
    const sess = session(T0 + DAY, [{ idiomId: 'b', correct: false, mistakeType: 'SOKUON' }])
    const r = buildSessionSummary(input(prior, sess))
    expect(r.finding?.kind).not.toBe('MISTAKE_TREND')
  })

  it('한국음 간섭이 있으면 추이 다음으로 앞선다 — 이 앱의 진단축', () => {
    const sess = session(T0, [
      { idiomId: 'a', correct: false, mistakeType: 'KO_INTERFERENCE' },
      { idiomId: 'b', correct: false, mistakeType: 'SOKUON' },
    ])
    expect(buildSessionSummary(input([], sess)).finding).toEqual({
      kind: 'KO_INTERFERENCE', count: 1, headword: '発達', reading: 'はったつ',
    })
  })

  it('새로 뚫은 음독은 가장 많이 열어주는 것을 고른다', () => {
    // a 를 맞히면 発(23개 해금)·達(5개)이 뚫린다 — 発 이 뽑혀야 한다
    const sess = session(T0, [
      { idiomId: 'a' },
      { idiomId: 'b', correct: false, mistakeType: 'SOKUON' },
    ])
    expect(buildSessionSummary(input([], sess)).finding).toEqual({
      kind: 'ONYOMI_UNLOCKED', kanji: '発', base: 'はつ', onKind: 'on', unlocks: 23,
    })
  })

  it('나빠지는 추이는 새 음독보다 뒤', () => {
    const wrong = (n: number, at: number) =>
      session(at, Array.from({ length: n }, () => ({
        idiomId: 'b', correct: false, mistakeType: 'SOKUON' as MistakeType,
      })))
    const prior = [...wrong(1, T0), ...wrong(2, T0 + DAY)]
    const sess = wrong(3, T0 + 2 * DAY)
    const r = buildSessionSummary(input(prior, sess))
    expect(r.trend).toEqual([1, 2, 3])
    expect(r.finding).toEqual({
      kind: 'MISTAKE_TREND', type: 'SOKUON', direction: 'up', sessions: 3,
    })
  })

  it('아무 관찰도 안 나오면 null — 억지로 만들지 않는다', () => {
    expect(buildSessionSummary(input([], [])).finding).toBeNull()
  })

  it('이름을 못 찾는 숙어의 한국음 간섭은 건너뛴다', () => {
    const sess = session(T0, [{ idiomId: 'b', correct: false, mistakeType: 'KO_INTERFERENCE' }])
    const r = buildSessionSummary(input([], sess))
    expect(r.finding?.kind).not.toBe('KO_INTERFERENCE')
  })
})

describe('결정론', () => {
  it('같은 입력이면 같은 요약이 나온다', () => {
    const prior = session(T0, [{ idiomId: 'a', correct: false, mistakeType: 'CHOON' }])
    const sess = session(T0 + DAY, [{ idiomId: 'a' }, { idiomId: 'b' }])
    expect(buildSessionSummary(input(prior, sess))).toEqual(buildSessionSummary(input(prior, sess)))
  })
})
