// 한글 섞인 답을 채점 전에 걸러내는 가드 (2026-09-19). iOS 에서 한글 키보드가 뜬 채로 치면
// wanakana 가 변환을 못 해 그대로 오답이 되고, 오답 유형 분포와 복습 일정까지 오염된다
import { describe, expect, it } from 'vitest'
import { hasHangul } from './hangul.ts'

describe('hasHangul', () => {
  it('완성형 음절을 잡는다', () => {
    expect(hasHangul('가나')).toBe(true)
    expect(hasHangul('にっしょう 맞나')).toBe(true)
  })

  it('호환 자모(ㄱ·ㅏ)와 조합 자모를 잡는다 — 조합 중인 글자도 막아야 한다', () => {
    expect(hasHangul('ㄱ')).toBe(true)
    expect(hasHangul('ㅏ')).toBe(true)
    expect(hasHangul('ᄀ')).toBe(true)
  })

  it('로마자·가나·한자는 통과시킨다', () => {
    expect(hasHangul('nisshou')).toBe(false)
    expect(hasHangul('にっしょう')).toBe(false)
    expect(hasHangul('ニッショウ')).toBe(false)
    expect(hasHangul('日照')).toBe(false)
    expect(hasHangul('')).toBe(false)
  })

  it('가나 장음부·촉음 같은 특수 문자도 통과시킨다', () => {
    expect(hasHangul('コーヒー')).toBe(false)
    expect(hasHangul('がっこう')).toBe(false)
  })
})
