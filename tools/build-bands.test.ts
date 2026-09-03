// 밴드 산정 규칙의 단위 동작과 전체 분포 스냅샷을 고정하는 테스트
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { priorityToBand, minNf } from './lib/bands.ts'
import { computeDistribution } from './build-bands.ts'

describe('priorityToBand — nf 빈도 순위 단독 규칙', () => {
  it('nf01~nf10 은 밴드 0', () => {
    expect(priorityToBand(['news1', 'nf01'])).toBe(0)
    expect(priorityToBand(['ichi1', 'news1', 'nf10'])).toBe(0)
  })

  it('nf11~nf20 은 밴드 1', () => {
    expect(priorityToBand(['news1', 'nf11'])).toBe(1)
    expect(priorityToBand(['news1', 'nf20'])).toBe(1)
  })

  it('nf21~nf24 (news1 끝) 은 밴드 2', () => {
    expect(priorityToBand(['news1', 'nf21'])).toBe(2)
    expect(priorityToBand(['news1', 'nf24'])).toBe(2)
  })

  it('nf25~nf48 (news2 구간) 은 밴드 3', () => {
    expect(priorityToBand(['news2', 'nf25'])).toBe(3)
    expect(priorityToBand(['news2', 'nf48'])).toBe(3)
  })

  it('nf 태그가 없으면 밴드 4 — 태그 유무와 무관', () => {
    expect(priorityToBand([])).toBe(4)
    expect(priorityToBand(['spec1'])).toBe(4)
    expect(priorityToBand(['ichi1', 'gai1'])).toBe(4)
  })

  it('nf 가 여럿이면 가장 낮은(= 가장 흔한) 번호를 쓴다', () => {
    expect(minNf(['nf30', 'nf12'])).toBe(12)
    expect(priorityToBand(['news1', 'nf12', 'news2', 'nf30'])).toBe(1)
  })
})

const idiomsPath = join(DICT_DIR, 'idioms.json')
const hasDict = existsSync(idiomsPath)

describe.runIf(hasDict)('밴드 분포 스냅샷 (data/dict/idioms.json)', () => {
  const { idioms } = JSON.parse(readFileSync(idiomsPath, 'utf8')) as { idioms: IdiomRecord[] }

  it('분포가 확정 규칙과 일치한다', () => {
    expect(computeDistribution(idioms)).toEqual({
      total: 107532,
      byBand: { '0': 4033, '1': 3945, '2': 1509, '3': 7889, '4': 90156 },
      band4Common: 1096,
    })
  })

  it('Phase 1 잠정 규칙의 결함(밴드 3 = 53개)이 해소됐다', () => {
    const dist = computeDistribution(idioms)
    expect(dist.byBand['3']).toBeGreaterThan(7000)
  })

  it('news1 은 nf01~24, news2 는 nf25~48 에만 나타난다 (경계 근거)', () => {
    // 실측 17건. 대부분은 한 표제어에 표기형이 여럿이라 nf 가 둘 붙은 유니온 아티팩트이고
    // (協同組合 = nf09 + nf47), 순수 불일치는 6건(逓信·容態·萎縮·淡白·証取法·大路)이다.
    // 급증하면 경계 규칙을 재검토해야 한다.
    let crossed = 0
    for (const it of idioms) {
      const nf = minNf(it.priority)
      if (nf === null) continue
      if (it.priority.includes('news1') && nf > 24) crossed++
      if (it.priority.includes('news2') && nf <= 24) crossed++
    }
    expect(crossed).toBeLessThanOrEqual(20)
  })
})
