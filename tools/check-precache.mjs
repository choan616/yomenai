// 빌드된 서비스워커의 프리캐시 목록에 **꼭 들어가야 할 파일**이 다 있는지 본다 (2026-09-22).
//
// **크기 초과는 이 도구가 막는 게 아니다.** `maximumFileSizeToCacheInBytes` 를 넘기면
// vite-plugin-pwa 가 `PLUGIN_ERROR` 를 던져 `vite build` 자체가 실패한다 (실측: 상한을
// 3MB 로 낮추니 종료코드 1, 이 도구는 돌지도 않았다).
//
// 이 도구가 막는 것은 **크기가 아닌 이유로 목록에서 빠지는 경우**다 — globPatterns 를
// 고치다 한 줄을 빠뜨리거나, globIgnores 가 넓어지거나, 파일 이름이 바뀌는 것. 그때는
// **빌드가 조용히 성공하고**(실측 확인) 오프라인에서만 `Failed to fetch` 가 난다.
//
// 덤으로 매 빌드에 여유를 찍는다. `base.json` 은 필드를 더할 때마다 커져서
// (readingKind 를 넣으며 5.42 → 5.63MB) 상한에 닿기 전에 눈에 띄어야 한다.
//
// `npm run build` 끝에 붙어 돈다 — CI 의 배포도 여기서 멈춘다.
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
/** 오프라인에서 앱이 서려면 있어야 하는 것들. `vite.config.ts` 의 globPatterns 와 짝이다 */
const REQUIRED = [
  'index.html',
  'dict/base.json',
  'dict/pairs.json',
  'dict/kanji.json',
  'dict/examples.json',
]
/** `vite.config.ts` 의 `maximumFileSizeToCacheInBytes` 와 같아야 한다 */
const CAP = 12 * 1024 * 1024

const sw = readFileSync(join(DIST, 'sw.js'), 'utf8')
const cached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]))

const mb = (n) => (n / 1048576).toFixed(2)
const missing = REQUIRED.filter((f) => !cached.has(f))

console.log(`프리캐시 ${cached.size}개 · 상한 ${mb(CAP)}MB`)
let tightest = 0
for (const f of REQUIRED) {
  let size = 0
  try {
    size = statSync(join(DIST, f)).size
  } catch {
    /* 파일 자체가 없으면 아래 missing 이 잡는다 */
  }
  tightest = Math.max(tightest, size)
  const mark = cached.has(f) ? ' ' : '✗'
  console.log(`  ${mark} ${f.padEnd(20)} ${mb(size).padStart(6)}MB`)
}
console.log(`  여유 ${mb(CAP - tightest)}MB`)

if (missing.length > 0) {
  console.error(
    `\n프리캐시에서 빠졌다: ${missing.join(', ')}\n` +
      `상한(${mb(CAP)}MB)을 넘었을 가능성이 크다. vite.config.ts 의 ` +
      `maximumFileSizeToCacheInBytes 와 이 파일의 CAP 을 함께 올려라.`,
  )
  process.exit(1)
}
