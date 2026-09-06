// 홈 화면 아이콘 — 「読」을 서브셋 폰트에서 벡터 패스로 뽑아 校正紙 컨셉으로 조립한다.
// CJK 통합 대응(CLAUDE.md): 글꼴 의존 없이 실제 JP 자형을 패스로 굽는다. 朱 「？」는 손주석 느낌.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { create as createFont } from 'fontkit'

const ROOT = join(import.meta.dirname, '..')
const FONT = join(ROOT, 'public', 'fonts', 'NotoSansJP-subset.woff2')
const OUT = join(ROOT, 'public', 'favicon.svg')

// 앱 토큰 (src/index.css 라이트)
const PAPER = '#f7f5f1'
const INK = '#1a1714'
const AKA = '#c33a1c' // 朱 — 앱에서 색은 이거 하나뿐

interface Glyph {
  path: { toSVG: () => string }
  bbox: { minX: number; minY: number; maxX: number; maxY: number }
}
const font = createFont(readFileSync(FONT)) as unknown as {
  glyphForCodePoint: (cp: number) => Glyph
}

/**
 * 글리프 패스(폰트 좌표, y-up)를 캔버스에서 (cx,cy) 중심, 최대 변 `box` 크기로 놓는다.
 * scale(s,-s) 로 y 를 뒤집고, bbox 로 정확히 중앙 정렬한다.
 */
function placeGlyph(ch: string, cx: number, cy: number, box: number): string {
  const g = font.glyphForCodePoint(ch.codePointAt(0)!)
  const { minX, minY, maxX, maxY } = g.bbox
  const s = box / Math.max(maxX - minX, maxY - minY)
  const tx = cx - s * ((minX + maxX) / 2)
  const ty = cy + s * ((minY + maxY) / 2)
  return `<g transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${s.toFixed(4)} ${(-s).toFixed(4)})"><path d="${g.path.toSVG()}" fill="${INK}"/></g>`
}

const SIZE = 512
const R = 116 // 둥근 모서리 (≈ 22.7%, iOS 슈퍼타원 근사)

// 読 — 캔버스 살짝 아래·왼쪽에 앉혀 오른쪽 위에 주석 여백을 남긴다
const YOMU = placeGlyph('読', 236, 280, 330)

// 朱 「？」 — 손으로 그린 한 획 느낌(서브셋에 ？ 자형이 없어 직접 그린다). 살짝 기울여 여백에 적은 주석처럼
const QMARK = `<g transform="translate(378 74) rotate(8)" fill="none" stroke="${AKA}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round">
<path d="M4 34 C4 2 70 0 70 36 C70 60 38 60 38 88"/>
<path d="M38 128 l0 3"/>
</g>`

// 朱 교정선 — 読 아래를 훑는 빠른 밑줄. "이거 확인" 표시
const RULE = `<path d="M104 450 C 200 466 312 466 410 440" fill="none" stroke="${AKA}" stroke-width="16" stroke-linecap="round"/>`

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<rect width="${SIZE}" height="${SIZE}" rx="${R}" fill="${PAPER}"/>
${YOMU}
${RULE}
${QMARK}
</svg>
`

writeFileSync(OUT, svg)
console.log(`${OUT} — ${(svg.length / 1024).toFixed(1)} KB`)
// public/apple-touch-icon.png (180) 은 이 SVG 를 브라우저로 한 번 래스터한 것이다.
// 디자인이 바뀌면 SVG 를 열어 180×180 으로 캡처해 교체한다 (헤드리스 브라우저 의존을 build 에 안 넣음).
