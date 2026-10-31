// 보조 글자색(--text-faint)이 배경·면 위에서 본문 대비(4.5:1)를 지키게 막는 검사 (2026-10-31 디자인 검토)
// 토큰 하나가 12~14px 설명 글자 76곳에 쓰여, 색을 한 단계 연하게 만들면 전 화면의 설명이 읽기 어려워진다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')

const lum = (hex: string): number => {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const [r, g, b] = [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const ratio = (a: string, b: string): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}
/** `#fff` 같은 3자리 표기를 6자리로 편다 */
const full = (hex: string): string =>
  hex.length === 4 ? `#${[...hex.slice(1)].map((c) => c + c).join('')}` : hex

/** `at` 보다 앞에서 가장 가까운 `--name: #rgb|#rrggbb` 값 — 같은 테마 블록의 값이다 */
const nearestBefore = (name: string, at: number): string => {
  const m = [...css.slice(0, at).matchAll(new RegExp(`${name}: (#[0-9a-fA-F]{3,6});`, 'g'))].at(-1)
  if (!m) throw new Error(`${name} 를 못 찾았다`)
  return full(m[1]!)
}

describe('--text-faint 대비', () => {
  const at = [...css.matchAll(/--text-faint: #[0-9a-fA-F]{6};/g)].map((m) => m.index!)

  it('라이트·다크 두 벌씩, 모두 찾는다', () => {
    expect(at).toHaveLength(4)
  })

  it.each(at.map((i) => [i]))('블록(%i)의 배경·면·보조 면 위에서 4.5:1 이상이다', (i) => {
    const faint = css.slice(i).match(/#[0-9a-fA-F]{6}/)![0]
    for (const surface of ['--bg', '--surface', '--surface-2']) {
      expect(ratio(faint, nearestBefore(surface, i)), `${surface} 위 ${faint}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
