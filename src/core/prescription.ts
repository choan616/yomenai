// 처방 — "다음에 뭘 보면 되나"를 파급력 순으로 고른다. 리포트가 진단에서 멈추지 않게 하는 부분이다 (PLAN §1)
import type { Band } from '../lib/bands.ts'
import type { LevelProfile } from './level.ts'
import type { Report } from './report.ts'
import type { MistakeType } from './types.ts'

/** 이만큼은 풀어야 오답 분포를 신호로 읽는다. 그 아래서는 처방 대신 표본을 더 모으자고 말한다 */
export const PRESCRIPTION_MIN_READINGS = 30
/** 한 유형이 전체 오답에서 이 비율을 넘으면 "규칙 하나로 여러 개가 줄어드는" 축으로 본다 */
export const DOMINANT_SHARE = 0.3
/** 한 번에 내미는 처방 수. 늘리면 대시보드가 되고 안 읽힌다 (sessionSummary 의 "발견 한 줄"과 같은 원칙) */
export const MAX_PRESCRIPTIONS = 3
/** 처방으로 올리는 음독 수 */
export const ONYOMI_PICKS = 2

/**
 * 처방 한 조각.
 *
 * `ONYOMI` 만 그 자리에서 실행 가능하다(집중 세션). 나머지는 읽을 것이다 —
 * 규칙과 방향은 세션으로 만들 수 없고, 만들면 그냥 평범한 세션이 된다.
 */
export type Prescription =
  | { kind: 'MORE_DATA'; seen: number; need: number }
  | { kind: 'MISTAKE_RULE'; type: MistakeType; count: number; share: number }
  | {
      kind: 'ONYOMI'
      pairId: string
      kanji: string
      base: string
      onKind: 'on' | 'kun'
      wrong: number
      seen: number
      /** 그 음독을 쓰는 숙어 수 — "뚫으면 N개가 열린다"의 N */
      unlocks: number
    }
  | { kind: 'BAND'; band: Band; rate: number; seen: number }

export interface PrescriptionInput {
  report: Report
  level: LevelProfile
  /** 그 음독을 쓰는 숙어 수. `sessionSummary` 의 같은 이름 콜백과 같은 것이다 */
  unlocksOf: (pairId: string) => number
}

/**
 * 순서는 "고치면 가장 많이 바뀌는 것" 순이다.
 *
 * 1. 지배적 오답 유형 — 규칙 하나를 익히면 여러 숙어가 한꺼번에 맞는다
 * 2. 파급력 큰 취약 음독 — 쌍 하나가 여러 숙어에 걸려 있다
 * 3. 경계 밴드 — 어디에 시간을 쓸지의 방향
 *
 * 취약 음독 후보는 `report.weakOnyomi`(오답률 상위)를 그대로 쓰고 그 안에서 파급력으로
 * 다시 세운다. 파급력만으로 전수 정렬하면 흔한 음독이 오답률과 무관하게 늘 1등이 된다.
 */
export function prescribe(input: PrescriptionInput): Prescription[] {
  const { report, level, unlocksOf } = input

  if (level.totalReadings < PRESCRIPTION_MIN_READINGS) {
    return [
      {
        kind: 'MORE_DATA',
        seen: level.totalReadings,
        need: PRESCRIPTION_MIN_READINGS - level.totalReadings,
      },
    ]
  }

  const out: Prescription[] = []

  const top = report.mistakes[0]
  if (top && report.totalWrong > 0) {
    const share = top.count / report.totalWrong
    if (share >= DOMINANT_SHARE) {
      out.push({ kind: 'MISTAKE_RULE', type: top.type, count: top.count, share })
    }
  }

  const byLeverage = report.weakOnyomi
    .map((w) => ({ w, unlocks: unlocksOf(w.pairId) }))
    .sort(
      (a, b) =>
        b.unlocks - a.unlocks ||
        b.w.rate - a.w.rate ||
        (a.w.pairId < b.w.pairId ? -1 : a.w.pairId > b.w.pairId ? 1 : 0),
    )
    .slice(0, ONYOMI_PICKS)
  for (const { w, unlocks } of byLeverage) {
    out.push({
      kind: 'ONYOMI',
      pairId: w.pairId,
      kanji: w.kanji,
      base: w.base,
      onKind: w.kind,
      wrong: w.wrong,
      seen: w.seen,
      unlocks,
    })
  }

  if (level.edge !== null) {
    const row = level.bands.find((b) => b.band === level.edge)
    if (row) out.push({ kind: 'BAND', band: row.band, rate: row.rate, seen: row.seen })
  }

  return out.slice(0, MAX_PRESCRIPTIONS)
}
