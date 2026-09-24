// 서브셋 폰트 검증 — 학습 문자가 실제로 담겼는지. build:fonts 의 커버리지 검사를 테스트로 고정한다
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { create as createFont } from 'fontkit'

const BASE = join('public', 'dict', 'base.json')
// 찾기가 밴드 4 까지 열려(2026-09-23) 그 글자도 평소에 화면에 뜬다. 폰트를 안 고쳐
// 鬱(憂鬱·陰鬱) 같은 104자가 폴백으로 렌더링되고 있었다 (2026-09-25 발견)
const BAND4 = join('public', 'dict', 'band4.json')
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
    expect(missingFrom(BASE, glyphs)).toEqual([])
  })

  // 찾기 결과에 그대로 뜨는 글자다. 한중일 통합이라 폴백이 나면 한국 자형을 볼 수 있다
  it.runIf(!skip && existsSync(BAND4))('band4.json 의 글자도 담는다 — 찾기가 여기까지 연다', () => {
    expect(missingFrom(BAND4, glyphs)).toEqual([])
  })
})

/** 사전 파일의 표기·읽기 중 서브셋에 없는 글자 */
function missingFrom(path: string, glyphs: Set<number>): string[] {
  const { idioms } = JSON.parse(readFileSync(path, 'utf8')) as {
    idioms: { headword: string; reading: string }[]
  }
  const missing = new Set<string>()
  for (const it of idioms) {
    for (const ch of it.headword + it.reading) {
      if (!glyphs.has(ch.codePointAt(0)!)) missing.add(ch)
    }
  }
  return [...missing]
}
