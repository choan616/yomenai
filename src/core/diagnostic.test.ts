// 진입 진단 검증 — 시드 고정 무작위 표본과 밴드별 요약 집계
import { describe, expect, it } from 'vitest'
import type { Band } from '../lib/bands.ts'
import type { IdiomEntry } from './session.ts'
import type { LearningEvent } from './types.ts'
import { DIAGNOSTIC_SEED, diagnosticSummary, pickDiagnostic } from './diagnostic.ts'

function entry(id: string, band: Band): IdiomEntry {
  return { idiomId: id, band, category: 1, classSource: 'default', pairIds: [`${id}:on:x`] }
}

// 밴드 0~4 각 40개
const pool: IdiomEntry[] = []
for (const band of [0, 1, 2, 3, 4] as Band[]) {
  for (let i = 0; i < 40; i++) pool.push(entry(`${band}-${i}`, band))
}

describe('pickDiagnostic', () => {
  it('밴드 1~3 에서만, 밴드당 perBand 개씩 뽑는다', () => {
    const picked = pickDiagnostic(pool, 10)
    expect(picked).toHaveLength(30)
    const byBand = new Map<Band, number>()
    for (const p of picked) byBand.set(p.band, (byBand.get(p.band) ?? 0) + 1)
    expect([...byBand.entries()].sort()).toEqual([
      [1, 10],
      [2, 10],
      [3, 10],
    ])
  })

  it('같은 시드면 같은 문항, 다른 시드면 대개 다르다', () => {
    const a = pickDiagnostic(pool, 10, DIAGNOSTIC_SEED).map((p) => p.idiomId)
    const b = pickDiagnostic(pool, 10, DIAGNOSTIC_SEED).map((p) => p.idiomId)
    const c = pickDiagnostic(pool, 10, DIAGNOSTIC_SEED + 1).map((p) => p.idiomId)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('중복 없이 뽑고, 밴드가 얇으면 있는 만큼만', () => {
    const picked = pickDiagnostic(pool, 100)
    expect(new Set(picked.map((p) => p.idiomId)).size).toBe(picked.length)
    expect(picked).toHaveLength(120) // 40 * 3
  })

  it('결과는 밴드 오름차순으로 이어 붙는다', () => {
    const bands = pickDiagnostic(pool, 5).map((p) => p.band)
    expect(bands).toEqual([...bands].sort((x, y) => x - y))
  })
})

describe('diagnosticSummary', () => {
  const band: Record<string, Band> = { a: 1, b: 1, c: 2 }
  const ev = (idiomId: string, correct: boolean): LearningEvent => ({
    id: `x${idiomId}${correct}`, userId: 'local', deviceId: 'd', at: 1, idiomId,
    cardType: 'reading', mistakeType: null, deletedAt: null,
    type: 'review', grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1,
  })

  it('읽기 채점 이벤트를 밴드별 정답 수로 접는다', () => {
    const events = [ev('a', true), ev('a', false), ev('b', true), ev('c', false)]
    expect(diagnosticSummary(events, (id) => band[id])).toEqual([
      { band: 1, seen: 3, correct: 2 },
      { band: 2, seen: 1, correct: 0 },
    ])
  })

  it('meaningKnown 이벤트와 밴드 미상 숙어는 무시한다', () => {
    const mk: LearningEvent = {
      id: 'mk1', userId: 'local', deviceId: 'd', at: 1, idiomId: 'a',
      cardType: 'meaning', mistakeType: null, deletedAt: null, type: 'meaningKnown', known: true,
    }
    expect(diagnosticSummary([mk, ev('zzz', true)], (id) => band[id])).toEqual([])
  })
})
