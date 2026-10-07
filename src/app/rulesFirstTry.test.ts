// 규칙 절 화면의 첫 만남 문구 분기 검증 — 표본 문턱(FIRST_TRY_MIN_SAMPLE) 미만이면 비율 대신 "N개뿐"을 말한다
import { describe, expect, it } from 'vitest'
import { FIRST_TRY_MIN_SAMPLE } from '../core/firstTry.ts'
import { firstTryLineText } from './rulesFirstTry.ts'

describe('firstTryLineText', () => {
  it('표본이 없으면 "아직 처음 만난 말이 없어요"', () => {
    expect(firstTryLineText({ seen: 0, correct: 0 })).toBe('아직 처음 만난 말이 없어요')
  })

  it('문턱 미만이면 비율 대신 "N개뿐"을 말한다', () => {
    expect(firstTryLineText({ seen: 1, correct: 0 })).toBe('처음 만난 말이 1개뿐이라 아직 비율을 안 내요')
    expect(firstTryLineText({ seen: FIRST_TRY_MIN_SAMPLE - 1, correct: FIRST_TRY_MIN_SAMPLE - 1 })).toBe(
      `처음 만난 말이 ${FIRST_TRY_MIN_SAMPLE - 1}개뿐이라 아직 비율을 안 내요`,
    )
  })

  it('문턱 이상이면 비율을 말한다', () => {
    expect(firstTryLineText({ seen: FIRST_TRY_MIN_SAMPLE, correct: 3 })).toBe(
      `처음 만난 ${FIRST_TRY_MIN_SAMPLE}개 중 3개를 읽었어요`,
    )
    expect(firstTryLineText({ seen: 69, correct: 47 })).toBe('처음 만난 69개 중 47개를 읽었어요')
  })
})
