// 로마자 접두 판정 — kyuu 를 kyy 로 만들던 이웃 키 혼동을 가르는 근거 (2026-10-11)
import { describe, expect, it } from 'vitest'
import { canExtend, isRomajiPrefix, trailingRomaji } from './romajiPrefix.ts'

describe('isRomajiPrefix', () => {
  it('빈 문자열과 완성·진행 중인 음절은 말이 된다', () => {
    for (const s of ['', 'k', 'ky', 'kyu', 'sh', 'shi', 'ts', 'n', 'nn', 'ka', 'tt', 'ch', 'ny', 'j']) {
      expect(isRomajiPrefix(s), s).toBe(true)
    }
  })

  it('음절이 못 되는 조합은 말이 안 된다', () => {
    for (const s of ['kyy', 'yy', 'ww', 'wy', 'kyk']) {
      expect(isRomajiPrefix(s), s).toBe(false)
    }
    // kky 는 「っきゃ」의 앞부분이라 말이 된다
    expect(isRomajiPrefix('kky')).toBe(true)
  })
})

describe('canExtend — 이웃 키 사이에서 고르는 근거', () => {
  it('ky 뒤에서는 u 만 말이 되고 y 는 안 된다 (kyuu → kyy 의 원인)', () => {
    expect(canExtend('ky', 'u')).toBe(true)
    expect(canExtend('ky', 'y')).toBe(false)
  })

  it('y 뒤의 y 는 안 되고 u 는 된다 — 「yu」 를 빠르게 칠 때', () => {
    expect(canExtend('y', 'u')).toBe(true)
    expect(canExtend('y', 'y')).toBe(false)
  })

  it('음절이 막 끝난 자리에서는 둘 다 된다 — 그때는 기하(눌린 자리)와 직전 키로 가른다', () => {
    expect(canExtend('', 'u')).toBe(true)
    expect(canExtend('', 'y')).toBe(true)
  })

  it('자음 겹침(촉음)과 ん 은 말이 된다', () => {
    expect(canExtend('t', 't')).toBe(true)
    expect(canExtend('n', 'n')).toBe(true)
    expect(canExtend('n', 'k')).toBe(true)
  })
})

describe('trailingRomaji', () => {
  it('끝에 남은 알파벳만 뽑는다', () => {
    expect(trailingRomaji('きゅ')).toBe('')
    expect(trailingRomaji('きy')).toBe('y')
    expect(trailingRomaji('ひとky')).toBe('ky')
    expect(trailingRomaji('')).toBe('')
  })
})
