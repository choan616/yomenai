// 환경설정 파싱·클램프 검증 — 깨진 값과 범위 초과를 안전하게 처리한다
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from './settings.ts'

describe('parseSettings', () => {
  it('정상 값은 그대로 통과한다', () => {
    expect(
      parseSettings({
        sessionLimit: 25,
        ratio: { correction: 6, expansion: 4 },
        keyFeedback: 'sound',
        keypadLayout: 'compact',
        browseMask: false,
        kunPercent: 30,
      }),
    ).toEqual({
      sessionLimit: 25,
      ratio: { correction: 6, expansion: 4 },
      keyFeedback: 'sound',
      keypadLayout: 'compact',
      browseMask: false,
      kunPercent: 30,
    })
  })

  it('다시보기 가림은 기본이 켬이고, false 만 끔으로 받는다', () => {
    expect(parseSettings({}).browseMask).toBe(true)
    expect(parseSettings({ browseMask: 'nope' }).browseMask).toBe(true)
    expect(parseSettings({ browseMask: false }).browseMask).toBe(false)
  })

  it('세션 길이를 5~40 으로 클램프하고 반올림한다', () => {
    expect(parseSettings({ sessionLimit: 2 }).sessionLimit).toBe(5)
    expect(parseSettings({ sessionLimit: 999 }).sessionLimit).toBe(40)
    expect(parseSettings({ sessionLimit: 17.6 }).sessionLimit).toBe(18)
  })

  it('깨진 값·null·비객체는 기본값', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('nope')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ sessionLimit: 'x' }).sessionLimit).toBe(DEFAULT_SETTINGS.sessionLimit)
  })

  it('ratio 합이 0 이거나 음수·NaN 이면 기본 비율로', () => {
    expect(parseSettings({ ratio: { correction: 0, expansion: 0 } }).ratio).toEqual(DEFAULT_SETTINGS.ratio)
    expect(parseSettings({ ratio: { correction: -1, expansion: 3 } }).ratio).toEqual(DEFAULT_SETTINGS.ratio)
    expect(parseSettings({ ratio: {} }).ratio).toEqual(DEFAULT_SETTINGS.ratio)
  })

  it('반환값은 기본값 객체와 참조를 공유하지 않는다', () => {
    const s = parseSettings(null)
    s.ratio.correction = 99
    expect(DEFAULT_SETTINGS.ratio.correction).toBe(7)
  })
})

describe('parseSettings — 자판 입력 피드백', () => {
  it('없으면 끔이 기본이다 — 소리도 진동도 기기 상황에 걸려 예측이 어렵다', () => {
    expect(parseSettings({}).keyFeedback).toBe('off')
  })

  it('sound·haptic 만 받는다', () => {
    expect(parseSettings({ keyFeedback: 'sound' }).keyFeedback).toBe('sound')
    expect(parseSettings({ keyFeedback: 'haptic' }).keyFeedback).toBe('haptic')
  })

  it('모르는 값은 기본으로 되돌린다', () => {
    expect(parseSettings({ keyFeedback: 'buzz' }).keyFeedback).toBe('off')
    expect(parseSettings({ keyFeedback: 7 }).keyFeedback).toBe('off')
  })
})

describe('parseSettings — 자판 배열', () => {
  it('기본은 QWERTY — 손가락이 기억한 자리를 안 건드린다', () => {
    expect(parseSettings({}).keypadLayout).toBe('qwerty')
  })

  it('compact 만 받는다', () => {
    expect(parseSettings({ keypadLayout: 'compact' }).keypadLayout).toBe('compact')
    expect(parseSettings({ keypadLayout: 'dvorak' }).keypadLayout).toBe('qwerty')
  })
})
