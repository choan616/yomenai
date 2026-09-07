// 진입 진단을 언제 권하는지 — 플래그가 기기를 안 넘어가는 문제를 로그로 메운다 (2026-09-07)
import { describe, expect, it } from 'vitest'
import { shouldOfferDiagnostic } from './diagnostic-state.ts'
import type { LevelProfile } from '../core/level.ts'

function level(over: Partial<LevelProfile> = {}): LevelProfile {
  return { bands: [], solidThrough: null, edge: null, totalReadings: 0, ...over }
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

  it('표본이 얇아 판정이 안 서면 여전히 권한다 — 진단이 아직 할 말이 있다', () => {
    // 3문항만 풀고 나간 상태. LEVEL_MIN_SEEN 에 못 미쳐 thin 이라 양쪽 다 null 이다
    expect(shouldOfferDiagnostic(false, level({ totalReadings: 3 }))).toBe(true)
  })
})
