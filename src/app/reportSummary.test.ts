// 리포트 요약 타일 문구 검증 — 수준·학습한 날·많이 틀린 유형·취약 음독, 값이 없을 때
import { describe, expect, it } from 'vitest'
import { summaryTiles, type TileInput } from './reportSummary.ts'

const base: TileInput = {
  level: { solidThrough: null, edge: 0 },
  streak: { current: 8, longest: 8 },
  month: { days: 12, cards: 90 },
  top: { label: '음독 선택', count: 29 },
  totalWrong: 53,
  weak: { count: 6, topRate: 0.75 },
}

describe('summaryTiles', () => {
  it('넷이고 순서가 수준·학습한 날·많이 틀린 유형·취약 음독이다 (같은 시트를 여는 타일이 둘 없다)', () => {
    const tiles = summaryTiles(base)
    expect(tiles.map((t) => t.label)).toEqual(['수준', '학습한 날', '많이 틀린 유형', '취약 음독'])
    expect(new Set(tiles.map((t) => t.sheet)).size).toBe(4)
  })

  it('수준은 안정적으로 읽는 가장 높은 코스이고, 흔들리는 코스는 부제로 경계라고 말한다', () => {
    expect(summaryTiles({ ...base, level: { solidThrough: 2, edge: 3 } })[0]).toMatchObject({
      value: '중턱',
      sub: '경계 능선',
      shade: 2,
      sheet: 'level',
    })
  })

  it('안정이 없고 경계가 둘째 코스 이상이면 그 바로 아래를 수준으로 본다 (산책로는 따로 재지 않는다)', () => {
    expect(summaryTiles({ ...base, level: { solidThrough: null, edge: 1 } })[0]).toMatchObject({
      value: '산책로',
      sub: '경계 뒷산',
      shade: 0,
    })
  })

  it('첫 코스부터 흔들리면 수준을 말하지 않고 경계만 말한다', () => {
    const t = summaryTiles(base)[0]!
    expect(t).toMatchObject({ value: '—', sub: '경계 산책로' })
    expect(t.shade).toBeUndefined()
  })

  it('코스 이름의 농도 단계는 보이는 수준의 코스 번호를 따른다', () => {
    expect(summaryTiles({ ...base, level: { solidThrough: 1, edge: 2 } })[0]!.shade).toBe(1)
    expect(summaryTiles({ ...base, level: { solidThrough: 3, edge: null } })[0]!.shade).toBe(3)
    expect(summaryTiles({ ...base, level: { solidThrough: null, edge: null } })[0]!.shade).toBeUndefined()
  })

  it('경계가 없고 안정 구간만 있으면 안정이다', () => {
    const t = summaryTiles({ ...base, level: { solidThrough: 2, edge: null } })[0]!
    expect(t).toMatchObject({ value: '중턱', sub: '안정이에요' })
  })

  it('기록이 적으면 수준을 말하지 않는다', () => {
    const t = summaryTiles({ ...base, level: { solidThrough: null, edge: null } })[0]!
    expect(t.value).toBe('—')
  })

  it('연속 중이면 일수를, 최장이 더 길면 최장도 말한다', () => {
    expect(summaryTiles(base)[1]).toMatchObject({ value: '8일째', sub: '이어 가는 중', sheet: 'days' })
    expect(summaryTiles({ ...base, streak: { current: 3, longest: 20 } })[1]).toMatchObject({
      value: '3일째',
      sub: '최장 20일',
    })
  })

  it('연속이 없으면 끊겼다고 말하지 않고 이번 달 학습일로 말한다', () => {
    const t = summaryTiles({ ...base, streak: { current: 0, longest: 20 } })[1]!
    expect(t.value).toBe('이번 달 12일')
    expect(t.sub).toBe('90장')
    expect(JSON.stringify(t)).not.toMatch(/끊/)
  })

  it('이번 달 기록도 없으면 빈 칸이다', () => {
    const t = summaryTiles({ ...base, streak: { current: 0, longest: 0 }, month: { days: 0, cards: 0 } })[1]!
    expect(t).toMatchObject({ value: '—', sub: '아직 없어요' })
  })

  it('1등 오답 유형과 몫을 보인다', () => {
    expect(summaryTiles(base)[2]).toMatchObject({ value: '음독 선택', sub: '29회 · 오답의 55%', warn: true, sheet: 'mist' })
  })

  it('오답이 없으면 짚을 게 없다고 말한다', () => {
    const t = summaryTiles({ ...base, top: null, totalWrong: 0 })[2]!
    expect(t).toMatchObject({ value: '없어요' })
    expect(t.warn).toBeUndefined()
  })

  it('취약 음독은 개수와 가장 높은 오답률을 보이고 취약 음독 시트를 연다', () => {
    expect(summaryTiles(base)[3]).toMatchObject({ value: '6개', sub: '최고 오답률 75%', sheet: 'weak' })
  })

  it('취약 음독이 없으면 없다고 말한다', () => {
    expect(summaryTiles({ ...base, weak: null })[3]).toMatchObject({ value: '없어요', sheet: 'weak' })
  })
})
