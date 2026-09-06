// 루비 분해 검증 — 자리별 읽기가 맞게 얹히는지, 실패 시 통째로 떨어지는지
import { describe, expect, it } from 'vitest'
import { rubyOf } from './ruby.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'

const lookup = (k: string) => KANJI_FIXTURE[k]

describe('rubyOf', () => {
  it('한자마다 그 자리의 표면형을 얹는다', () => {
    expect(rubyOf('学校', 'がっこう', lookup)).toEqual([
      { text: '学', rt: 'がっ' },
      { text: '校', rt: 'こう' },
    ])
  })

  it('連濁·促音 이 일어난 자리도 표면형 그대로 얹는다', () => {
    expect(rubyOf('三日月', 'みかづき', lookup)).toEqual([
      { text: '三', rt: 'み' },
      { text: '日', rt: 'か' },
      { text: '月', rt: 'づき' },
    ])
  })

  it('분해되지 않으면 숙어 전체에 하나만 얹는다', () => {
    expect(rubyOf('学校', 'あいうえお', lookup)).toEqual([{ text: '学校', rt: 'あいうえお' }])
  })

  it('사전에 없는 한자면 통째로 떨어진다', () => {
    expect(rubyOf('龘龘', 'ああ', lookup)).toEqual([{ text: '龘龘', rt: 'ああ' }])
  })

  it('조각을 이으면 원래 표기와 읽기가 복원된다', () => {
    for (const [hw, rd] of [['学校', 'がっこう'], ['発達', 'はったつ'], ['心配', 'しんぱい']]) {
      const segs = rubyOf(hw, rd, lookup)
      expect(segs.map((s) => s.text).join('')).toBe(hw)
      expect(segs.map((s) => s.rt).join('')).toBe(rd)
    }
  })
})
