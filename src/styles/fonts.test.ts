// 서브셋 폰트 검증 — 학습 문자가 실제로 담겼는지. build:fonts 의 커버리지 검사를 테스트로 고정한다
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { create as createFont } from 'fontkit'

const SUBSET = join('public', 'fonts', 'NotoSerifJP-subset.woff2')
const BASE = join('public', 'dict', 'base.json')

function charSet(path: string): Set<number> {
  const font = createFont(readFileSync(path)) as unknown as { characterSet: number[] }
  return new Set(font.characterSet)
}

describe.runIf(existsSync(SUBSET) && existsSync(BASE))('NotoSerifJP-subset.woff2', () => {
  const glyphs = charSet(SUBSET)
  const has = (s: string) => [...s].every((c) => glyphs.has(c.codePointAt(0)!))

  it('한중일 자형이 갈리는 대표 한자를 담는다 (PLAN §7)', () => {
    for (const ch of '骨直次令') expect(has(ch)).toBe(true)
  })

  it('히라가나·가타카나 전 구간과 장음·중점을 담는다', () => {
    for (let cp = 0x3041; cp <= 0x3096; cp++) expect(glyphs.has(cp)).toBe(true)
    for (let cp = 0x30a1; cp <= 0x30fa; cp++) expect(glyphs.has(cp)).toBe(true)
    expect(has('ーヴ・')).toBe(true)
  })

  it('base.json 의 모든 숙어·읽기 문자를 100% 담는다 (폴백 0)', () => {
    const { idioms } = JSON.parse(readFileSync(BASE, 'utf8')) as {
      idioms: { headword: string; reading: string }[]
    }
    const missing = new Set<string>()
    for (const it of idioms) {
      for (const ch of it.headword + it.reading) {
        if (!glyphs.has(ch.codePointAt(0)!)) missing.add(ch)
      }
    }
    expect([...missing]).toEqual([])
  })
})
