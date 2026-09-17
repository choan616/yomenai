// 한일 혼합 문장 가르기 검증 — 이어 붙이면 원문이고, 한글 자모가 일본어로 안 샌다
import { describe, expect, it } from 'vitest'
import { hasJa, splitJa } from './ja.ts'
import { RULE_SECTIONS } from './rules.ts'

describe('splitJa', () => {
  it('일본어 구간만 ja 로 표시한다', () => {
    expect(splitJa('ㄱ 받침은 く·き 로 — 学 학 がく.')).toEqual([
      { text: 'ㄱ 받침은 ', ja: false },
      { text: 'く', ja: true },
      { text: '·', ja: false },
      { text: 'き', ja: true },
      { text: ' 로 — ', ja: false },
      { text: '学', ja: true },
      { text: ' 학 ', ja: false },
      { text: 'がく', ja: true },
      { text: '.', ja: false },
    ])
  })

  it('이어 붙이면 원문 그대로다', () => {
    for (const s of RULE_SECTIONS) {
      for (const p of [...s.body, s.summary]) {
        expect(splitJa(p).map((r) => r.text).join(''), s.id).toBe(p)
      }
    }
  })

  it('한글 자모는 일본어가 아니다 — 받침 이름이 일본 자형으로 새면 안 된다', () => {
    expect(hasJa('ㄱㄴㄹㅁㅂㅇ 받침')).toBe(false)
    expect(splitJa('ㄹ 받침').every((r) => !r.ja)).toBe(true)
  })

  it('일본어가 없으면 통째로 한 덩어리다', () => {
    expect(splitJa('한국어만 있는 문장')).toEqual([{ text: '한국어만 있는 문장', ja: false }])
  })

  it('한자 용어도 잡는다 — 음편(音便)·熟字訓 같은 것', () => {
    expect(hasJa('음편(音便)이 아니에요')).toBe(true)
    expect(splitJa('숙자훈(熟字訓)은').filter((r) => r.ja).map((r) => r.text)).toEqual(['熟字訓'])
  })

  it('규칙 본문에 실제로 일본어가 섞여 있다 — 이 장치가 필요한 이유다', () => {
    const mixed = RULE_SECTIONS.flatMap((s) => s.body).filter(hasJa)
    expect(mixed.length).toBeGreaterThan(5)
  })
})
