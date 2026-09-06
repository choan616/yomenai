// 음독 메아리 검증 — 세션 시작 집계 + 이번 세션 누적으로 "몇 번째"를 만든다
import { describe, expect, it } from 'vitest'
import { onyomiEcho } from './echo.ts'
import { newEventId, type LearningEvent, type OnyomiStat, type ReviewEvent } from './types.ts'

const T0 = Date.UTC(2026, 0, 1)

let seq = 0
function review(idiomId: string, correct = true): ReviewEvent {
  seq++
  return {
    id: newEventId(T0 + seq * 1000, () => ((seq * 11) % 36) / 36),
    userId: 'local',
    deviceId: 'dev',
    at: T0 + seq * 1000,
    idiomId,
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: correct ? 3 : 1,
    answer: '',
    expected: '',
    correct,
    elapsedMs: 900,
  }
}

const PAIRS_OF: Record<string, string[]> = {
  a: ['発:on:はつ', '達:on:たつ'],
  b: ['発:on:はつ', '表:on:ひょう'],
}
const pairsOf = (id: string) => PAIRS_OF[id] ?? []

function before(entries: [string, number][]): Map<string, OnyomiStat> {
  return new Map(entries.map(([pairId, seen]) => [pairId, { pairId, seen, wrong: 0 }]))
}

describe('onyomiEcho', () => {
  it('쌍 id 를 풀어 한자·음독·음훈 구분을 낸다', () => {
    const echo = onyomiEcho({
      pairIds: ['発:on:はつ'], before: new Map(), sessionEvents: [], pairsOf,
    })
    expect(echo).toEqual([{ kanji: '発', base: 'はつ', kind: 'on', nth: 1 }])
  })

  it('훈독 쌍도 구분해서 낸다', () => {
    const echo = onyomiEcho({
      pairIds: ['月:kun:つき'], before: new Map(), sessionEvents: [], pairsOf,
    })
    expect(echo[0]).toMatchObject({ kanji: '月', base: 'つき', kind: 'kun' })
  })

  it('세션 시작 시점 집계에 1 을 더한다', () => {
    const echo = onyomiEcho({
      pairIds: ['発:on:はつ'], before: before([['発:on:はつ', 4]]), sessionEvents: [], pairsOf,
    })
    expect(echo[0].nth).toBe(5)
  })

  it('이번 세션에서 이미 만난 횟수도 더한다', () => {
    // b 도 発:on:はつ 를 쓴다 — 다른 숙어를 통해 만난 것도 센다
    const echo = onyomiEcho({
      pairIds: ['発:on:はつ'],
      before: before([['発:on:はつ', 2]]),
      sessionEvents: [review('a'), review('b')],
      pairsOf,
    })
    expect(echo[0].nth).toBe(5)
  })

  it('오답도 만난 것으로 센다 — 노출 횟수이지 정답 횟수가 아니다', () => {
    const echo = onyomiEcho({
      pairIds: ['発:on:はつ'], before: new Map(), sessionEvents: [review('a', false)], pairsOf,
    })
    expect(echo[0].nth).toBe(2)
  })

  it('뜻 카드와 묘비는 세지 않는다', () => {
    const meaning: ReviewEvent = { ...review('a'), cardType: 'meaning' }
    const tomb: LearningEvent = { ...review('a'), deletedAt: T0 }
    const echo = onyomiEcho({
      pairIds: ['発:on:はつ'], before: new Map(), sessionEvents: [meaning, tomb], pairsOf,
    })
    expect(echo[0].nth).toBe(1)
  })

  it('숙어의 모든 쌍을 순서대로 낸다', () => {
    const echo = onyomiEcho({
      pairIds: PAIRS_OF.a, before: before([['達:on:たつ', 9]]), sessionEvents: [], pairsOf,
    })
    expect(echo.map((e) => `${e.kanji}${e.nth}`)).toEqual(['発1', '達10'])
  })

  it('같은 쌍이 두 번 들어가도 한 번만 낸다 — 々 전개 대응', () => {
    const echo = onyomiEcho({
      pairIds: ['人:on:にん', '人:on:にん'], before: new Map(), sessionEvents: [], pairsOf,
    })
    expect(echo).toHaveLength(1)
  })

  it('형식이 깨진 쌍 id 는 건너뛴다', () => {
    const echo = onyomiEcho({
      pairIds: ['망가짐', '発:on:はつ', '発:xx:はつ'],
      before: new Map(), sessionEvents: [], pairsOf,
    })
    expect(echo.map((e) => e.kanji)).toEqual(['発'])
  })
})
