// 서브셋 폰트 검증 — 학습 문자가 실제로 담겼는지. build:fonts 의 커버리지 검사를 테스트로 고정한다
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { create as createFont } from 'fontkit'

const BASE = join('public', 'dict', 'base.json')
// Regular·Bold 두 굵기 모두 같은 문자 집합을 100% 덮어야 한다 (합성 볼드는 자형을 왜곡)
const SUBSETS = [
  join('public', 'fonts', 'NotoSansJP-subset.woff2'),
  join('public', 'fonts', 'NotoSansJP-Bold-subset.woff2'),
]

function charSet(path: string): Set<number> {
  const font = createFont(readFileSync(path)) as unknown as { characterSet: number[] }
  return new Set(font.characterSet)
}

describe.each(SUBSETS)('%s', (subset) => {
  const skip = !existsSync(subset) || !existsSync(BASE)
  const glyphs = skip ? new Set<number>() : charSet(subset)
  const has = (s: string) => [...s].every((c) => glyphs.has(c.codePointAt(0)!))

  it.runIf(!skip)('한중일 자형이 갈리는 대표 한자를 담는다 (PLAN §7)', () => {
    for (const ch of '骨直次令') expect(has(ch)).toBe(true)
  })

  it.runIf(!skip)('히라가나·가타카나 전 구간과 장음·중점을 담는다', () => {
    for (let cp = 0x3041; cp <= 0x3096; cp++) expect(glyphs.has(cp)).toBe(true)
    for (let cp = 0x30a1; cp <= 0x30fa; cp++) expect(glyphs.has(cp)).toBe(true)
    expect(has('ーヴ・')).toBe(true)
  })

  it.runIf(!skip)('base.json 의 모든 숙어·읽기 문자를 100% 담는다 (폴백 0)', () => {
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
