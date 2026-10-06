// 화면에 보이는 밴드 이름 — 방향이 읽히는 이름, 조사
import { describe, expect, it } from 'vitest'
import { BAND_NAME, bandName, bandNameIga } from './bands.ts'

describe('bandName', () => {
  it('0 → 4 로 오를수록 어려운 말이다 (이름이 방향을 말한다)', () => {
    expect([0, 1, 2, 3, 4].map(bandName)).toEqual(['산책로', '뒷산', '중턱', '능선', '정상'])
    expect(new Set(Object.values(BAND_NAME)).size).toBe(5)
  })

  it('범위 밖 번호는 번호로 돌려준다', () => {
    expect(bandName(9)).toBe('밴드 9')
  })
})

describe('bandNameIga', () => {
  it('받침이 없으면 가, 있으면 이', () => {
    expect(bandNameIga(0)).toBe('산책로가')
    expect(bandNameIga(1)).toBe('뒷산이')
    expect(bandNameIga(2)).toBe('중턱이')
    expect(bandNameIga(3)).toBe('능선이')
  })
})
