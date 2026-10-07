// 응답 시간 집계 검증 — 표본 문턱, 느린 카드 판정, 극단값·중복 숙어·삭제 이벤트 처리
import { describe, expect, it } from 'vitest'
import { PACE_MIN_SAMPLE, paceProfile } from './pace.ts'
import type { ReviewEvent } from './types.ts'

let seq = 0
function ev(idiomId: string, over: Partial<ReviewEvent> = {}): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at: 1_700_000_000_000 + seq,
    idiomId,
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: 4,
    answer: 'みかづき',
    expected: 'みかづき',
    correct: true,
    elapsedMs: 1000,
    ...over,
  }
}

/** 서로 다른 숙어로 정답 이벤트 n개를 만든다. elapsedMs 는 idiomOf(i) 로 바꿀 수 있다 */
function correctEvents(n: number, elapsedMsOf: (i: number) => number = () => 1000): ReviewEvent[] {
  return Array.from({ length: n }, (_, i) => ev(String(i + 1), { elapsedMs: elapsedMsOf(i) }))
}

describe('paceProfile', () => {
  it('① 표본이 PACE_MIN_SAMPLE 미만이면 null, 그만큼 모이면 값이 난다', () => {
    expect(paceProfile(correctEvents(PACE_MIN_SAMPLE - 1))).toBeNull()
    const profile = paceProfile(correctEvents(PACE_MIN_SAMPLE))
    expect(profile).not.toBeNull()
    expect(profile?.medianMs).toBe(1000)
    expect(profile?.slow).toEqual([])
  })

  it('② 정답률이 같고 응답 시간만 다른 두 로그가 서로 다른 slow 를 낸다', () => {
    const withOutlier = correctEvents(20, (i) => (i === 0 ? 5000 : 1000))
    const withoutOutlier = correctEvents(20, () => 1000)

    const a = paceProfile(withOutlier)
    const b = paceProfile(withoutOutlier)

    expect(a?.medianMs).toBe(1000)
    expect(a?.slow).toEqual([{ idiomId: '1', elapsedMs: 5000 }])
    expect(b?.slow).toEqual([])
  })

  it('③ 60초 넘는 이벤트와 0 이하 이벤트가 중앙값·slow 를 안 흔든다', () => {
    const baseline = correctEvents(20, (i) => (i + 1) * 100) // 100..2000, 중앙값 1050
    const withExtremes = [
      ...baseline,
      ev('21', { elapsedMs: 100_000 }), // 60초 초과 — 버려진다
      ev('22', { elapsedMs: 0 }), // 0 이하 — 버려진다
    ]

    const base = paceProfile(baseline)
    const withOutliers = paceProfile(withExtremes)

    expect(base?.medianMs).toBe(1050)
    expect(withOutliers?.medianMs).toBe(1050)
    expect(withOutliers?.slow.some((s) => s.idiomId === '21' || s.idiomId === '22')).toBe(false)
  })

  it('④ 같은 숙어의 옛 이벤트가 최신 것을 덮지 않는다', () => {
    // '1' 과 안 겹치게 '101'..'119' 로 채운다
    const baseline = Array.from({ length: 19 }, (_, i) => ev(String(101 + i), { elapsedMs: 1000 }))
    const idiomOneOld = ev('1', { at: 1_000, elapsedMs: 50_000 }) // 옛 이벤트 — 느리다
    const idiomOneLatest = ev('1', { at: 2_000, elapsedMs: 1000 }) // 최신 이벤트 — 빠르다

    const profile = paceProfile([...baseline, idiomOneOld, idiomOneLatest])

    expect(profile).not.toBeNull()
    expect(profile?.slow.some((s) => s.idiomId === '1')).toBe(false)
  })

  it('⑤ 지워진 이벤트가 안 들어온다', () => {
    const baseline = correctEvents(20, () => 1000)
    const deleted = ev('21', { elapsedMs: 5000, deletedAt: 1_700_000_100_000 })

    const profile = paceProfile([...baseline, deleted])

    expect(profile?.medianMs).toBe(1000)
    expect(profile?.slow).toEqual([])
  })

  it('⑥ 느리고 틀린 답은 slow 에 안 든다 (2026-10-07, 교수자 관점 보완 7단계)', () => {
    const baseline = correctEvents(20, () => 1000)
    const slowWrong = ev('21', { elapsedMs: 50_000, correct: false })

    const profile = paceProfile([...baseline, slowWrong])

    expect(profile?.slow.some((s) => s.idiomId === '21')).toBe(false)
  })

  it('⑦ 오답은 중앙값을 안 움직인다 (2026-10-07, 교수자 관점 보완 7단계)', () => {
    const baseline = correctEvents(20, () => 1000)
    const slowWrong = ev('21', { elapsedMs: 50_000, correct: false })

    const withWrong = paceProfile([...baseline, slowWrong])
    const withoutWrong = paceProfile(baseline)

    expect(withWrong?.medianMs).toBe(withoutWrong?.medianMs)
    expect(withWrong?.medianMs).toBe(1000)
  })

  it('⑧ counted 는 비율의 분모다 — 중앙값을 낸 정답 표본 수 (2026-10-07, 화면이 「정답 중 N%」를 말한다)', () => {
    const baseline = correctEvents(20, (i) => (i === 0 ? 5000 : 1000))
    const slowWrong = ev('21', { elapsedMs: 50_000, correct: false })

    const profile = paceProfile([...baseline, slowWrong])

    // 오답은 분모에 안 든다 — 21개를 심었지만 정답 20개가 분모다
    expect(profile?.counted).toBe(20)
    expect(profile?.slow).toHaveLength(1)
  })
})
