// 런타임 사전 번들 검증 — 로더가 buildSession 이 받는 풀을 만들고, 개수가 산출물과 일치한다
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildSession } from '../core/session.ts'
import { normalizeIdiom, type RuntimeIdiom } from './load.ts'

const BASE = join('public', 'dict', 'base.json')
const BAND4 = join('public', 'dict', 'band4.json')

const readIdioms = (path: string): RuntimeIdiom[] =>
  (JSON.parse(readFileSync(path, 'utf8')) as { idioms: Parameters<typeof normalizeIdiom>[0][] })
    .idioms.map(normalizeIdiom)

describe.runIf(existsSync(BASE))('base.json', () => {
  const raw = JSON.parse(readFileSync(BASE, 'utf8')) as { _meta: { count: number }; idioms: unknown[] }
  const pool = readIdioms(BASE)

  it('_meta.count 와 실제 레코드 수가 일치한다', () => {
    expect(pool.length).toBe(raw._meta.count)
    expect(pool.length).toBe(raw.idioms.length)
  })

  it('모든 레코드가 학습에 필요한 필드를 갖춘다', () => {
    for (const p of pool) {
      expect(p.idiomId).toMatch(/^\d+$/)
      expect(p.headword.length).toBeGreaterThan(0)
      expect(p.reading.length).toBeGreaterThan(0)
      expect(p.band).toBeGreaterThanOrEqual(0)
      expect(p.band).toBeLessThanOrEqual(3)
      expect([1, 2, 3]).toContain(p.category)
      expect(['manual', 'llm', 'default']).toContain(p.classSource)
      expect(p.pairIds.length).toBeGreaterThan(0)
      for (const id of p.pairIds) expect(id).toMatch(/^.+:(on|kun):.+$/)
    }
  })

  it('buildSession 이 이 풀을 그대로 받아 세션을 만든다', () => {
    const now = Date.UTC(2026, 8, 4)
    const session = buildSession(pool, [], { now, limit: 20 })
    expect(session.cards.length).toBeGreaterThan(0)
    expect(session.cards.length).toBeLessThanOrEqual(20)
    for (const c of session.cards) {
      expect(pool.some((p) => p.idiomId === c.idiomId)).toBe(true)
      expect(c.due).toBe(false) // 이벤트가 없으니 전부 신규 도입
    }
  })

  it('밴드 4 는 base 에 없다', () => {
    expect(pool.every((p) => p.band <= 3)).toBe(true)
  })
})

describe.runIf(existsSync(BAND4))('band4.json', () => {
  it('전부 밴드 4 이고 확장(2)/default 로 정규화된다', () => {
    const pool = readIdioms(BAND4)
    expect(pool.length).toBeGreaterThan(0)
    for (const p of pool.slice(0, 500)) {
      expect(p.band).toBe(4)
      expect(p.category).toBe(2)
      expect(p.classSource).toBe('default')
    }
  })
})
