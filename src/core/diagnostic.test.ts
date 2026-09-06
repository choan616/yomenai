// 진입 진단 검증 — 시드 고정 무작위 표본과 밴드별 요약 집계
import { describe, expect, it } from 'vitest'
import type { Band } from '../lib/bands.ts'
import type { IdiomEntry } from './session.ts'
import type { LearningEvent } from './types.ts'
import { bandVerdict, DIAGNOSTIC_SEED, diagnosticSummary, pickDiagnostic } from './diagnostic.ts'

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

describe('bandVerdict — 적응형 조기 종료', () => {
  it('오답 3개면 진단 전체 종료 (몇 개를 풀었든)', () => {
    expect(bandVerdict(3, 3)).toBe('endDiagnostic')
    expect(bandVerdict(5, 3)).toBe('endDiagnostic')
    expect(bandVerdict(11, 4)).toBe('endDiagnostic')
  })

  it('8개 이상 풀고 정답률 80% 이상이면 다음 밴드', () => {
    expect(bandVerdict(8, 1)).toBe('nextBand') // 7/8 = 87.5%
    expect(bandVerdict(10, 2)).toBe('nextBand') // 8/10 = 80%
  })

  it('8개 풀었어도 정답률이 80% 미만이면 계속 (오답 3 미만인 한)', () => {
    expect(bandVerdict(8, 2)).toBe('continue') // 6/8 = 75%
    expect(bandVerdict(9, 2)).toBe('continue')
  })

  it('상한 12개에 닿으면 애매해도 다음 밴드', () => {
    expect(bandVerdict(12, 2)).toBe('nextBand')
  })

  it('초반엔 계속', () => {
    expect(bandVerdict(0, 0)).toBe('continue')
    expect(bandVerdict(5, 2)).toBe('continue')
    expect(bandVerdict(7, 1)).toBe('continue') // 8개 미만이라 아직 판정 안 함
  })

  it('전형적 시나리오 — 밴드1 전승(≤8), 밴드1 전패(≤3)', () => {
    // 전승: 8개째에서 nextBand
    let v: string = 'continue'
    for (let seen = 1; seen <= 12 && v === 'continue'; seen++) v = bandVerdict(seen, 0)
    expect(v).toBe('nextBand')
    // 전패: 3개째에서 endDiagnostic
    v = 'continue'
    let seen = 0
    while (v === 'continue') { seen++; v = bandVerdict(seen, seen) }
    expect(v).toBe('endDiagnostic')
    expect(seen).toBe(3)
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
