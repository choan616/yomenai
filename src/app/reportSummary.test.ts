// 리포트 요약 타일 문구 검증 — 수준·정답률·학습한 날·많이 틀린 유형, 값이 없을 때
import { describe, expect, it } from 'vitest'
import { summaryTiles, type TileInput } from './reportSummary.ts'

const base: TileInput = {
  level: { solidThrough: null, edge: 0 },
  reviews: 162,
  accuracy: 67,
  streak: { current: 8, longest: 8 },
  month: { days: 12, cards: 90 },
  top: { label: '음독 선택', count: 29 },
  totalWrong: 53,
}

describe('summaryTiles', () => {
  it('넷이고 순서가 수준·정답률·학습한 날·많이 틀린 유형이다', () => {
    expect(summaryTiles(base).map((t) => t.label)).toEqual(['수준', '전체 정답률', '학습한 날', '많이 틀린 유형'])
  })

  it('경계가 있으면 그 밴드가 흔들린다고 말한다', () => {
    expect(summaryTiles(base)[0]).toMatchObject({ value: '밴드 0', sub: '흔들려요', sheet: 'level' })
  })

  it('경계가 없고 안정 구간만 있으면 안정이다', () => {
    const t = summaryTiles({ ...base, level: { solidThrough: 2, edge: null } })[0]!
    expect(t).toMatchObject({ value: '밴드 2', sub: '안정이에요' })
  })

  it('기록이 적으면 수준을 말하지 않는다', () => {
    const t = summaryTiles({ ...base, level: { solidThrough: null, edge: null } })[0]!
    expect(t.value).toBe('—')
  })

  it('정답률 타일은 수준 시트를 연다 (정답률은 수준 구역 안에 있다)', () => {
    expect(summaryTiles(base)[1]).toMatchObject({ value: '67%', sub: '읽기 162회', sheet: 'level' })
  })

  it('연속 중이면 일수를, 최장이 더 길면 최장도 말한다', () => {
    expect(summaryTiles(base)[2]).toMatchObject({ value: '8일째', sub: '이어 가는 중', sheet: 'days' })
    expect(summaryTiles({ ...base, streak: { current: 3, longest: 20 } })[2]).toMatchObject({
      value: '3일째',
      sub: '최장 20일',
    })
  })

  it('연속이 없으면 끊겼다고 말하지 않고 이번 달 학습일로 말한다', () => {
    const t = summaryTiles({ ...base, streak: { current: 0, longest: 20 } })[2]!
    expect(t.value).toBe('이번 달 12일')
    expect(t.sub).toBe('90장')
    expect(JSON.stringify(t)).not.toMatch(/끊/)
  })

  it('이번 달 기록도 없으면 빈 칸이다', () => {
    const t = summaryTiles({ ...base, streak: { current: 0, longest: 0 }, month: { days: 0, cards: 0 } })[2]!
    expect(t).toMatchObject({ value: '—', sub: '아직 없어요' })
  })

  it('1등 오답 유형과 몫을 보인다', () => {
    expect(summaryTiles(base)[3]).toMatchObject({ value: '음독 선택', sub: '29회 · 오답의 55%', warn: true, sheet: 'mist' })
  })

  it('오답이 없으면 짚을 게 없다고 말한다', () => {
    const t = summaryTiles({ ...base, top: null, totalWrong: 0 })[3]!
    expect(t).toMatchObject({ value: '없어요' })
    expect(t.warn).toBeUndefined()
  })
})
