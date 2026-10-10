// 진입 진단을 언제 권하는지 — 플래그가 기기를 안 넘어가는 문제를 로그로 메운다 (2026-09-07)
import { describe, expect, it } from 'vitest'
import { DIAGNOSTIC_ENOUGH_GRADES, shouldOfferDiagnostic } from './diagnostic-state.ts'
import type { LevelProfile } from '../core/level.ts'

function level(over: Partial<LevelProfile> = {}): LevelProfile {
  return { bands: [], solidThrough: null, nearThrough: null, near: [], edge: null, totalReadings: 0, ...over }
}

describe('shouldOfferDiagnostic', () => {
  it('플래그도 없고 판정도 없으면 권한다 — 정말 처음인 사용자', () => {
    expect(shouldOfferDiagnostic(false, level())).toBe(true)
  })

  it('이 기기에서 진단을 마쳤으면 안 권한다', () => {
    expect(shouldOfferDiagnostic(true, level())).toBe(false)
  })

  it('플래그가 없어도 경계가 잡혔으면 안 권한다 — 동기화로 기록만 받아온 기기', () => {
    expect(shouldOfferDiagnostic(false, level({ edge: 2, totalReadings: 80 }))).toBe(false)
  })

  it('안정 구간만 있어도 안 권한다 — 아직 벽을 안 만났을 뿐 수준은 섰다', () => {
    expect(shouldOfferDiagnostic(false, level({ solidThrough: 3, totalReadings: 120 }))).toBe(false)
  })

  it('문턱 부근만 있어도 안 권한다 — 안정도 흔들림도 아니지만 판정은 섰다 (2026-10-10)', () => {
    expect(shouldOfferDiagnostic(false, level({ near: [0, 1], nearThrough: 1, totalReadings: 400 }))).toBe(false)
  })

  it('판정은 안 섰어도 한 코스에 채점이 쌓였으면 안 권한다 — 판정 최소가 100회로 올랐어도 진단이 필요한 사람의 선은 그대로다 (2026-10-10)', () => {
    const thin = { band: 1 as const, seen: DIAGNOSTIC_ENOUGH_GRADES, correct: 0, rate: 0, idioms: 5, ci: [0, 1] as [number, number], status: 'thin' as const, met: 5, stable: 0 }
    expect(shouldOfferDiagnostic(false, level({ bands: [thin], totalReadings: 5 }))).toBe(false)
    expect(shouldOfferDiagnostic(false, level({ bands: [{ ...thin, seen: DIAGNOSTIC_ENOUGH_GRADES - 1 }], totalReadings: 4 }))).toBe(true)
  })

  it('표본이 얇아 판정이 안 서면 여전히 권한다 — 진단이 아직 할 말이 있다', () => {
    // 3문항만 풀고 나간 상태. 판정 최소(채점 100회·표현 60개)에 못 미쳐 thin 이라 양쪽 다 null 이다
    expect(shouldOfferDiagnostic(false, level({ totalReadings: 3 }))).toBe(true)
  })
})
