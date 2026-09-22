// 출제 범위 — 설정의 `includeKun` 이 훈독 숙어를 넣고 빼는지.
// **배포되는 번들 그대로** 검사한다. 이 규칙이 깨지면 기본 설정에서 浜辺(はまべ)·荒木(あらき)
// 가 다시 올라오고, 같은 범위를 보는 사다리·진단까지 같이 흔들린다 (2026-09-22).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from '../app/settings.ts'
import { buildSession } from '../core/session.ts'
import { normalizeIdiom, studyPool, type RuntimeIdiom } from './load.ts'

const pool: RuntimeIdiom[] = (() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/dict/base.json'), 'utf8')
  const { idioms } = JSON.parse(raw) as { idioms: Parameters<typeof normalizeIdiom>[0][] }
  return idioms.map(normalizeIdiom)
})()

const byHeadword = new Map(pool.map((p) => [p.headword, p]))

describe('readingKind — 빌드가 매긴 갈래', () => {
  it('모든 레코드에 갈래가 붙어 있다', () => {
    expect(pool.every((p) => p.readingKind === 'on' || p.readingKind === 'mix' || p.readingKind === 'kun')).toBe(true)
  })

  it('음독 쌍이 하나도 없으면 kun 이다', () => {
    for (const p of pool) {
      const on = p.pairIds.filter((id) => id.includes(':on:')).length
      expect(p.readingKind).toBe(on === 0 ? 'kun' : on === p.pairIds.length ? 'on' : 'mix')
    }
  })

  // 사용자가 세션에서 만나 어색하다고 지적한 것들 (밴드 검토 2026-09-21)
  it.each(['浜辺', '荒木', '滝川', '稲田', '生糸', '山奥', '北風'])('%s 는 훈독이다', (hw) => {
    expect(byHeadword.get(hw)?.readingKind).toBe('kun')
  })

  it('公庫 처럼 음독으로 읽는 것은 kun 이 아니다', () => {
    expect(byHeadword.get('公庫')?.readingKind).toBe('on')
  })
})

describe('studyPool — 설정이 범위를 정한다', () => {
  const off = studyPool(pool, false)
  const on = studyPool(pool, true)

  it('빼면 훈독이 하나도 안 남는다', () => {
    expect(off.filter((p: RuntimeIdiom) => p.readingKind === 'kun')).toHaveLength(0)
  })

  it('섞으면 풀 전체다', () => {
    expect(on).toHaveLength(pool.length)
  })

  it('뺀 만큼이 정확히 훈독 수다', () => {
    expect(pool.length - off.length).toBe(pool.filter((p) => p.readingKind === 'kun').length)
  })

  it('혼독은 어느 쪽이든 남는다 — 음독 쌍이 있어 대조·처방이 그대로 걸린다', () => {
    expect(off.some((p: RuntimeIdiom) => p.readingKind === 'mix')).toBe(true)
    expect(on.some((p: RuntimeIdiom) => p.readingKind === 'mix')).toBe(true)
  })

  it('원본을 안 건드린다', () => {
    const before = pool.length
    studyPool(pool, false)
    expect(pool).toHaveLength(before)
  })
})

describe('세션 — 설정이 실제 출제를 가른다', () => {
  const opts = { now: Date.now(), limit: 40, ratio: { correction: 7, expansion: 3 } }
  const byId = new Map(pool.map((p) => [p.idiomId, p]))

  it('기본(빼기) 세션에 훈독 숙어가 한 장도 안 나온다', () => {
    const s = buildSession(studyPool(pool, false), [], opts)
    expect(s.cards.length).toBeGreaterThan(0)
    expect(s.cards.filter((c) => byId.get(c.idiomId)?.readingKind === 'kun')).toHaveLength(0)
  })

  it('섞기로 두면 후보가 훈독까지 넓어진다', () => {
    expect(studyPool(pool, true).length).toBeGreaterThan(studyPool(pool, false).length)
  })

})

/**
 * **후보에 넣는 것과 실제로 뽑히는 것은 다르다.** `byIntroOrder` 가 밴드 다음으로 미숙 음독
 * 가중을 보는데 훈독 숙어는 음독 쌍이 없어 늘 바닥이라 줄 맨 뒤로 밀린다 — 풀의 8.9% 를
 * 넣어도 출제는 1% 였다. 그래서 `selectSession` 이 정원으로 떼어낸다. 여기가 그 검증이다
 */
describe('kunShare — 정원이 실제 출제 비율을 만든다', () => {
  const byId = new Map(pool.map((p) => [p.idiomId, p]))
  const LIMIT = 200
  /** 고정 시드는 제시 순서만 섞는다 — 무엇이 뽑히는지는 결정론이라 비율을 걸 수 있다 */
  const run = (kunShare: number) => {
    const cards = buildSession(studyPool(pool, kunShare > 0), [], {
      now: Date.UTC(2026, 8, 22),
      limit: LIMIT,
      ratio: { correction: 7, expansion: 3 },
      kunShare,
    }).cards
    const kun = cards.filter((c) => byId.get(c.idiomId)?.readingKind === 'kun').length
    return { total: cards.length, kun, share: kun / cards.length }
  }

  it('0 이면 한 장도 안 나온다', () => {
    expect(run(0).kun).toBe(0)
  })

  it('1 이면 훈독만 나온다', () => {
    const r = run(1)
    expect(r.total).toBe(LIMIT)
    expect(r.kun).toBe(LIMIT)
  })

  it.each([0.2, 0.5, 0.8])('%s 면 그 비율 ±3%%p 안에 든다', (share) => {
    const r = run(share)
    expect(r.total).toBe(LIMIT)
    expect(Math.abs(r.share - share)).toBeLessThanOrEqual(0.03)
  })

  it('정원을 줘도 세션 길이는 안 줄어든다', () => {
    for (const share of [0, 0.1, 0.5, 0.9, 1]) expect(run(share).total).toBe(LIMIT)
  })
})

describe('설정 — 기본은 0% 다', () => {
  it('DEFAULT_SETTINGS.kunPercent 가 0 이다', () => {
    expect(DEFAULT_SETTINGS.kunPercent).toBe(0)
  })

  it('저장된 적 없거나 깨졌으면 0 이다', () => {
    expect(parseSettings({}).kunPercent).toBe(0)
    expect(parseSettings({ kunPercent: 'half' }).kunPercent).toBe(0)
  })

  it('0~100 으로 자르고 10 단위로 맞춘다 — 레인지 눈금과 같게', () => {
    expect(parseSettings({ kunPercent: -20 }).kunPercent).toBe(0)
    expect(parseSettings({ kunPercent: 999 }).kunPercent).toBe(100)
    expect(parseSettings({ kunPercent: 47 }).kunPercent).toBe(50)
    expect(parseSettings({ kunPercent: 30 }).kunPercent).toBe(30)
  })
})
