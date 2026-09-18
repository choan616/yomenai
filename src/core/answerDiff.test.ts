// 답안 대조 — 오답에서 정답과 다른 글자만 골라내는지 확인
import { describe, expect, it } from 'vitest'
import { diffAnswer } from './answerDiff.ts'

const marks = (expected: string, answer: string) =>
  diffAnswer(expected, answer)
    .map((d) => (d.match ? d.char : `[${d.char}]`))
    .join('')

describe('diffAnswer', () => {
  it('정답이면 전부 일치', () => {
    expect(marks('たかみ', 'たかみ')).toBe('たかみ')
  })

  it('한 글자 치환 — 그 글자만 표시', () => {
    // 発端 はつたん → ONYOMI_CHOICE (たん 대신 たつ 를 쓴 경우 등 임의 예시)
    expect(marks('はったん', 'はつたん')).toBe('は[つ]たん')
  })

  it('장음 누락(CHOON) — 빠진 뒤로 밀리지 않고 그 글자만 없어진 것으로 본다', () => {
    // とくちょう → とくちょ. 뒤 글자가 밀려도 자리별 비교처럼 う 하나만 틀린 게 아니라
    // 통째로 없는 것이라, 정답 쪽 글자 수만큼은 대조 대상이 아니다(answer 기준 diff)
    expect(marks('とくちょう', 'とくちょ')).toBe('とくちょ')
  })

  it('촉음 삽입 — 삽입된 글자 하나만 표시하고 뒤는 안 밀린다', () => {
    expect(marks('はつひょう', 'はっつひょう')).toBe('は[っ]つひょう')
  })

  it('완전히 다른 답 — 전부 표시', () => {
    expect(marks('たかみ', 'ことば')).toBe('[こ][と][ば]')
  })

  it('빈 정답/오답', () => {
    expect(diffAnswer('たかみ', '')).toEqual([])
    expect(diffAnswer('', 'たかみ')).toEqual([
      { char: 'た', match: false },
      { char: 'か', match: false },
      { char: 'み', match: false },
    ])
  })
})
