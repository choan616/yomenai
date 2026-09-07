// 표면형 조회 — 대조의 기준이 원형이 아니라 실제로 난 소리라는 것 (Phase 11)
import { describe, expect, it } from 'vitest'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import { surfaceOfPair } from './surface.ts'

const lookup = (k: string) => KANJI_FIXTURE[k]

describe('surfaceOfPair', () => {
  it('촉음으로 변한 자리는 변한 소리를 낸다', () => {
    expect(surfaceOfPair('学校', 'がっこう', '学:on:がく', lookup)).toBe('がっ')
  })

  it('변형이 없으면 원형 그대로', () => {
    expect(surfaceOfPair('学食', 'がくしょく', '学:on:がく', lookup)).toBe('がく')
  })

  it('같은 원형이라도 숙어에 따라 표면형이 갈린다 — 대조가 성립하는 근거', () => {
    const a = surfaceOfPair('学校', 'がっこう', '学:on:がく', lookup)
    const b = surfaceOfPair('学食', 'がくしょく', '学:on:がく', lookup)
    expect(a).not.toBe(b)
  })

  it('그 쌍이 이 숙어에 없으면 null', () => {
    expect(surfaceOfPair('学校', 'がっこう', '発:on:はつ', lookup)).toBeNull()
  })

  it('분해에 실패하면 null (모르는 한자)', () => {
    expect(surfaceOfPair('謎謎', 'なぞなぞ', '謎:on:めい', lookup)).toBeNull()
  })
})
