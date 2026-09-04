// 진입 진단 — 밴드별 무작위 표본 출제로 숙달 수준을 추정한다 (PLAN §6 "진입 진단")
import type { Band } from '../lib/bands.ts'
import type { IdiomEntry } from './session.ts'
import type { LearningEvent } from './types.ts'

/** 무작위 표본의 시드를 명시한다 — 같은 입력이면 같은 문항이 나와야 진단이 재현 가능하다 */
export const DIAGNOSTIC_SEED = 20260904
export const DIAGNOSTIC_PER_BAND = 30
/** 밴드 0 은 건너뛰기 기본이라 제외, 밴드 4 는 선택이라 제외 (selectSession 기본 범위와 같다) */
export const DIAGNOSTIC_BANDS: Band[] = [1, 2, 3]

/** 재현 가능한 난수 (mulberry32). session.sim.test.ts 와 같은 계열 */
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const out = xs.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 각 밴드(1~3)에서 무작위로 `perBand` 개씩 뽑는다. 밴드가 그보다 얇으면 있는 만큼.
 * 결과는 밴드 오름차순으로 이어 붙인다.
 */
export function pickDiagnostic<T extends IdiomEntry>(
  pool: readonly T[],
  perBand: number = DIAGNOSTIC_PER_BAND,
  seed: number = DIAGNOSTIC_SEED,
): T[] {
  const rand = rng(seed)
  const out: T[] = []
  for (const band of DIAGNOSTIC_BANDS) {
    const inBand = pool.filter((p) => p.band === band)
    out.push(...shuffled(inBand, rand).slice(0, perBand))
  }
  return out
}

export interface BandEstimate {
  band: Band
  seen: number
  correct: number
}

/** 진단 이벤트(읽기 채점)를 밴드별 정답 수로 접는다. 별도 상태 저장 없이 이벤트 로그에서 파생 */
export function diagnosticSummary(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
): BandEstimate[] {
  const acc = new Map<Band, BandEstimate>()
  for (const e of events) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined) continue
    const row = acc.get(band) ?? { band, seen: 0, correct: 0 }
    row.seen++
    if (e.correct) row.correct++
    acc.set(band, row)
  }
  return [...acc.values()].sort((a, b) => a.band - b.band)
}
