// 한국어 뜻 구분자 정규화 검증 (사용자 요청 2026-09-12 — 세미콜론을 쉼표로)
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeDefinition, repairByteTokens } from './meaning.ts'

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

describe('repairByteTokens', () => {
  it('바이트 토큰 묶음을 원래 글자로 되살린다', () => {
    expect(repairByteTokens('가<0xEB><0x83><0x98>픔')).toBe('가냘픔')
    expect(repairByteTokens('<0xEB><0xB3><0x8F>짚 건조대')).toBe('볏짚 건조대')
    expect(repairByteTokens('백구(百<0xE9><0xAB><0xB2>), 백발')).toBe('백구(百髲), 백발')
  })

  it('한 뜻 안의 여러 묶음을 따로따로 되살린다', () => {
    expect(repairByteTokens('뻣뻣함, <0xEB><0xB9><0xB3><0xEB><0xB9><0xB3>함')).toBe('뻣뻣함, 빳빳함')
    expect(repairByteTokens('<0xEB><0x83><0x98>와 <0xEB><0x8B><0xA2>')).toBe('냘와 닢')
  })

  it('소문자 16진수도 받는다', () => {
    expect(repairByteTokens('<0xeb><0x83><0x98>')).toBe('냘')
  })

  it('해독이 안 되는 묶음(잘린 바이트)은 건드리지 않는다', () => {
    expect(repairByteTokens('가<0xEB><0x83>')).toBe('가<0xEB><0x83>')
    expect(repairByteTokens('<0xFF>')).toBe('<0xFF>')
  })

  it('마지막 바이트가 빠진 볏짚은 되살린다(앞 두 바이트 + 뒤 글자가 단어를 정한다)', () => {
    expect(repairByteTokens('<0xEB><0xB3>짚 태우기')).toBe('볏짚 태우기')
    // 뒤 글자가 짚이 아니면 짐작하지 않는다
    expect(repairByteTokens('새의 <0xEB><0xB3>듦')).toBe('새의 <0xEB><0xB3>듦')
  })

  it('토큰이 없는 글은 그대로다', () => {
    expect(repairByteTokens('분명함, 노골적임')).toBe('분명함, 노골적임')
  })

  it('normalizeDefinition 도 복원한다', () => {
    expect(normalizeDefinition('가<0xEB><0x83><0x98>픔;섬세함')).toBe('가냘픔, 섬세함')
  })
})

/** 바이트가 잘려 복원할 수 없는 뜻 — 사람이 정해야 한다(context-notes 2026-10-04). 고치면 이 목록에서 뺀다 */
const UNRECOVERABLE = new Set(['2180960', '2180970', '2597630', '2624430', '1167890'])

describe('배포 사전에는 복원 가능한 바이트 토큰이 없다', () => {
  it.each(['base', 'band4', 'wide', 'lookup'])('%s.json', (name) => {
    const { idioms } = JSON.parse(readFileSync(`public/dict/${name}.json`, 'utf8')) as {
      idioms: { id: string; koMeaning?: { definition: string } | null }[]
    }
    const left = idioms
      .filter((r) => /<0x[0-9A-Fa-f]{2}>/.test(r.koMeaning?.definition ?? '') && !UNRECOVERABLE.has(r.id))
      .map((r) => r.id)
    expect(left).toEqual([])
  })
})
