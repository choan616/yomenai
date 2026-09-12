// 한국어 뜻 구분자 정규화 검증 (사용자 요청 2026-09-12 — 세미콜론을 쉼표로)
import { describe, expect, it } from 'vitest'
import { normalizeDefinition } from './meaning.ts'

describe('normalizeDefinition', () => {
  it('세미콜론 구분자를 쉼표로 바꾼다', () => {
    expect(normalizeDefinition('충실함; 성실함')).toBe('충실함, 성실함')
  })

  it('붙여 쓴 세미콜론도 잡는다', () => {
    expect(normalizeDefinition('반면;얼굴의 반;사물의 한 면')).toBe('반면, 얼굴의 반, 사물의 한 면')
  })

  it('끝에 매달린 세미콜론은 버린다', () => {
    expect(normalizeDefinition('의류;')).toBe('의류')
    expect(normalizeDefinition('일본의 옛 이름; 야마토;')).toBe('일본의 옛 이름, 야마토')
  })

  it('구분자 뒤 홀로 남은 마침표를 버린다 (번역 잡음)', () => {
    expect(normalizeDefinition('(만듦새가) 가느다람;.(몸매가) 호리호리함; (폭이) 좁음')).toBe(
      '(만듦새가) 가느다람, (몸매가) 호리호리함, (폭이) 좁음',
    )
  })

  it('뜻 안의 쉼표·괄호·마침표는 안 건드린다', () => {
    expect(normalizeDefinition('중간 부분; (폐의) 중엽')).toBe('중간 부분, (폐의) 중엽')
    expect(normalizeDefinition('공기조절, 냉난방')).toBe('공기조절, 냉난방')
    expect(normalizeDefinition('약 3.3제곱미터')).toBe('약 3.3제곱미터')
  })

  it('세미콜론이 없으면 앞뒤 공백만 정리한다', () => {
    expect(normalizeDefinition('  철도  ')).toBe('철도')
  })

  it('빈 문자열은 빈 문자열', () => {
    expect(normalizeDefinition('')).toBe('')
  })
})
