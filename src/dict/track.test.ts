// 학습 트랙 분리 — 훈독 숙어가 기본 세션에 안 섞이는지, 훈독 세션에는 그것만 나오는지.
// **배포되는 번들 그대로** 검사한다. 이 규칙이 깨지면 浜辺(はまべ)·荒木(あらき) 가
// 음독 세션에 다시 올라오고 음독 수준 판정까지 흔든다 (2026-09-22).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSession } from '../core/session.ts'
import { inTrack, normalizeIdiom, type RuntimeIdiom } from './load.ts'

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

describe('inTrack — 트랙이 풀을 가른다', () => {
  const on = inTrack(pool, 'on')
  const kun = inTrack(pool, 'kun')

  it('둘로 남김없이 갈린다', () => {
    expect(on.length + kun.length).toBe(pool.length)
  })

  it('음독 트랙에 훈독이 없다', () => {
    expect(on.filter((p) => p.readingKind === 'kun')).toHaveLength(0)
  })

  it('혼독은 음독 트랙에 남는다 — 음독 쌍이 있어 대조·처방이 그대로 걸린다', () => {
    expect(on.some((p) => p.readingKind === 'mix')).toBe(true)
    expect(kun.every((p) => p.readingKind === 'kun')).toBe(true)
  })
})

describe('세션 — 트랙이 실제 출제를 가른다', () => {
  const opts = { now: Date.now(), limit: 40, ratio: { correction: 7, expansion: 3 } }

  it('기본 세션에 훈독 숙어가 한 장도 안 나온다', () => {
    const s = buildSession(inTrack(pool, 'on'), [], opts)
    const byId = new Map(pool.map((p) => [p.idiomId, p]))
    expect(s.cards.filter((c) => byId.get(c.idiomId)?.readingKind === 'kun')).toHaveLength(0)
  })

  it('훈독 세션은 훈독만 낸다', () => {
    const s = buildSession(inTrack(pool, 'kun'), [], opts)
    const byId = new Map(pool.map((p) => [p.idiomId, p]))
    expect(s.cards.length).toBeGreaterThan(0)
    expect(s.cards.every((c) => byId.get(c.idiomId)?.readingKind === 'kun')).toBe(true)
  })
})
