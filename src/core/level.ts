// 읽기 수준 — 밴드별 정답률과 "경계선". 리포트 최상단이 답해야 할 질문은 "내가 어디쯤인가"다 (PLAN §4/§7)
import { DIAGNOSTIC_BANDS, diagnosticSummary } from './diagnostic.ts'
import type { Band } from '../lib/bands.ts'
import type { LearningEvent } from './types.ts'

/** 밴드 하나에 판정을 내리는 데 필요한 최소 노출 수. 그 아래는 `thin`(표본 부족)이다 */
export const LEVEL_MIN_SEEN = 5
/**
 * "안정"의 문턱. `bandVerdict` 의 `OK_RATE` 와 같은 값을 쓴다 —
 * 진단이 "다음 밴드로" 넘긴 밴드가 리포트에서 "흔들림"으로 나오면 두 화면이 서로 다른 말을 한다.
 */
export const LEVEL_SOLID_RATE = 0.8

export type BandStatus = 'solid' | 'shaky' | 'thin' | 'unseen'

export interface BandRow {
  band: Band
  seen: number
  correct: number
  /** correct / seen. seen 이 0 이면 0 */
  rate: number
  status: BandStatus
}

export interface LevelProfile {
  /** 밴드 오름차순. 기본 학습 범위 + 실제로 푼 적 있는 밴드 */
  bands: BandRow[]
  /** 낮은 밴드부터 끊기지 않고 `solid` 인 마지막 밴드. 없으면 null */
  solidThrough: Band | null
  /** 지금 흔들리는 첫 밴드. 없으면 null (아직 벽을 못 만났다) */
  edge: Band | null
  /** 읽기 카드 채점 총 횟수. 표본이 얼마나 쌓였는지 */
  totalReadings: number
}

function statusOf(seen: number, correct: number): BandStatus {
  if (seen === 0) return 'unseen'
  if (seen < LEVEL_MIN_SEEN) return 'thin'
  return correct / seen >= LEVEL_SOLID_RATE ? 'solid' : 'shaky'
}

/**
 * 전체 이벤트 로그에서 밴드별 읽기 성적을 접는다.
 *
 * 진단 결과를 따로 저장하지 않는 이유는 append-only 로그로 언제든 다시 셀 수 있어서다
 * (PLAN §5 원칙 2). 그래서 이 프로필은 진단 직후에도, 세션을 100번 한 뒤에도 같은
 * 함수가 낸다 — 진단은 시작점일 뿐 수준의 출처가 아니다.
 */
export function buildLevel(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
): LevelProfile {
  const seen = new Map(diagnosticSummary(events, bandOf).map((r) => [r.band, r]))
  const bands = [...new Set<Band>([...DIAGNOSTIC_BANDS, ...seen.keys()])].sort((a, b) => a - b)

  const rows: BandRow[] = bands.map((band) => {
    const r = seen.get(band)
    const s = r?.seen ?? 0
    const c = r?.correct ?? 0
    return { band, seen: s, correct: c, rate: s > 0 ? c / s : 0, status: statusOf(s, c) }
  })

  let solidThrough: Band | null = null
  for (const row of rows) {
    if (row.status !== 'solid') break
    solidThrough = row.band
  }

  return {
    bands: rows,
    solidThrough,
    edge: rows.find((r) => r.status === 'shaky')?.band ?? null,
    totalReadings: rows.reduce((n, r) => n + r.seen, 0),
  }
}
