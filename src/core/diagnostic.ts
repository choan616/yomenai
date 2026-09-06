// 진입 진단 — 밴드별 무작위 표본 출제로 숙달 수준을 추정한다 (PLAN §6 "진입 진단")
import type { Band } from '../lib/bands.ts'
import type { IdiomEntry } from './session.ts'
import type { LearningEvent } from './types.ts'

/** 무작위 표본의 시드를 명시한다 — 같은 입력이면 같은 문항이 나와야 진단이 재현 가능하다 */
export const DIAGNOSTIC_SEED = 20260904
/**
 * 밴드당 뽑아 두는 문항 수의 상한. 실제로는 `bandVerdict` 가 결론이 서면 그 전에 멈춘다
 * (Phase 9-B 적응형). 예전엔 30 이라 밴드당 30 을 다 풀어야 했다.
 */
export const DIAGNOSTIC_PER_BAND = 12
/** 밴드 0 은 건너뛰기 기본이라 제외, 밴드 4 는 선택이라 제외 (selectSession 기본 범위와 같다) */
export const DIAGNOSTIC_BANDS: Band[] = [1, 2, 3]

/** 한 밴드를 풀다가 내리는 판정 */
export type BandVerdict = 'continue' | 'nextBand' | 'endDiagnostic'

/**
 * 진단의 목적은 "읽기가 흔들리기 시작하는 첫 밴드"를 찾는 것뿐이다. 그래서 밴드마다
 * 결론이 서면 즉시 멈춘다 (Phase 9-B). 임계값은 초안 — 실사용 로그 보고 조정한다.
 *
 * - 오답 3개 → 이 밴드가 흔들림. 진단 전체 종료 (더 어려운 밴드는 볼 필요 없다)
 * - 8개 이상 풀고 정답률 ≥ 80% → 이 밴드는 안정. 다음 밴드로
 * - 12개(상한) 도달 → 애매하면 있는 값으로, 다음 밴드로
 */
export function bandVerdict(seen: number, wrong: number): BandVerdict {
  const WRONG_STOP = 3
  const MIN_SEEN = 8
  const OK_RATE = 0.8
  const CAP = DIAGNOSTIC_PER_BAND

  if (wrong >= WRONG_STOP) return 'endDiagnostic'
  const correct = seen - wrong
  if (seen >= MIN_SEEN && correct / seen >= OK_RATE) return 'nextBand'
  if (seen >= CAP) return 'nextBand'
  return 'continue'
}

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
