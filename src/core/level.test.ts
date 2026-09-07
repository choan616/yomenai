// 읽기 수준 — 밴드별 판정과 경계선 위치 (Phase 10)
import { describe, expect, it } from 'vitest'
import { buildLevel, LEVEL_MIN_SEEN } from './level.ts'
import type { Band } from '../lib/bands.ts'
import type { LearningEvent } from './types.ts'

const band: Record<string, Band> = { b1: 1, b2: 2, b3: 3, b4: 4 }
let n = 0
const ev = (idiomId: string, correct: boolean): LearningEvent => ({
  id: `e${n++}`, userId: 'local', deviceId: 'd', at: n, idiomId,
  cardType: 'reading', mistakeType: null, deletedAt: null,
  type: 'review', grade: correct ? 3 : 1, answer: '', expected: '', correct, elapsedMs: 1,
})

/** 한 밴드에 정답 c 개 · 오답 w 개 */
function run(idiomId: string, c: number, w: number): LearningEvent[] {
  return [
    ...Array.from({ length: c }, () => ev(idiomId, true)),
    ...Array.from({ length: w }, () => ev(idiomId, false)),
  ]
}

const bandOf = (id: string) => band[id]

describe('buildLevel', () => {
  it('기본 학습 범위(밴드 1~3)는 기록이 없어도 행이 선다', () => {
    const level = buildLevel([], bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3])
    expect(level.bands.every((b) => b.status === 'unseen')).toBe(true)
    expect(level.solidThrough).toBeNull()
    expect(level.edge).toBeNull()
    expect(level.totalReadings).toBe(0)
  })

  it('푼 적 있는 밴드는 범위 밖이어도 행이 선다', () => {
    const level = buildLevel(run('b4', 5, 0), bandOf)
    expect(level.bands.map((b) => b.band)).toEqual([1, 2, 3, 4])
  })

  it('표본이 최소치 미만이면 판정하지 않고 thin 이다', () => {
    const level = buildLevel(run('b1', LEVEL_MIN_SEEN - 1, 0), bandOf)
    expect(level.bands[0].status).toBe('thin')
    expect(level.solidThrough).toBeNull()
  })

  it('정답률 80% 이상이면 solid, 미만이면 shaky', () => {
    // 밴드1 9/10 = 90% · 밴드2 8/10 = 80%(경계값 포함) · 밴드3 4/10 = 40%
    const level = buildLevel(
      [...run('b1', 9, 1), ...run('b2', 8, 2), ...run('b3', 4, 6)],
      bandOf,
    )
    expect(level.bands.map((b) => b.status)).toEqual(['solid', 'solid', 'shaky'])
    expect(level.solidThrough).toBe(2)
    expect(level.edge).toBe(3)
    expect(level.totalReadings).toBe(30)
  })

  it('solidThrough 는 낮은 밴드부터 끊기지 않은 구간만 센다', () => {
    // 밴드1 흔들림 · 밴드2 안정 — 밴드2 가 안정이어도 앞이 끊겼으니 solidThrough 는 null
    const level = buildLevel([...run('b1', 4, 6), ...run('b2', 10, 0)], bandOf)
    expect(level.solidThrough).toBeNull()
    expect(level.edge).toBe(1)
  })

  it('전부 안정이면 경계가 없다 — 아직 벽을 안 만난 상태', () => {
    const level = buildLevel(
      [...run('b1', 10, 0), ...run('b2', 10, 0), ...run('b3', 10, 0)],
      bandOf,
    )
    expect(level.solidThrough).toBe(3)
    expect(level.edge).toBeNull()
  })
})
