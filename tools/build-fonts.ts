// 학습 대상 문자 집합만 담은 일본어 서브셋 폰트를 만든다 (PLAN §7 "폰트 서브셋은 빌드타임 생성")
// 한중일 한자는 코드포인트가 통합돼 있어, 폴백이 한 번이라도 나면 사용자가 한국 자형을 학습한다.
// 그래서 서브셋이 학습 문자를 100% 덮는지 fontkit 으로 검증하고, 못 덮으면 빌드를 실패시킨다.
// Regular·Bold 두 굵기를 같은 문자 집합으로 서브셋한다 — 합성 볼드는 획을 뭉개 자형을 왜곡한다.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { create as createFont } from 'fontkit'
import subsetFont from 'subset-font'

const RAW_FONTS = join(import.meta.dirname, '..', 'data', 'raw', 'fonts')
const DICT_DIR = join(import.meta.dirname, '..', 'public', 'dict')
const OUT_DIR = join(import.meta.dirname, '..', 'public', 'fonts')

const SRC_KO = join(RAW_FONTS, 'Pretendard-Regular.woff2')

/** 같은 문자 집합으로 서브셋할 일본어 원본. lang="ja" + 100% 커버라 한국 자형 폴백이 안 난다 */
const JP_WEIGHTS = [
  { label: 'Regular', src: join(RAW_FONTS, 'NotoSansJP-Regular.otf'), out: 'NotoSansJP-subset.woff2' },
  { label: 'Bold', src: join(RAW_FONTS, 'NotoSansJP-Bold.otf'), out: 'NotoSansJP-Bold-subset.woff2' },
]

const withBand4 = process.argv.includes('--all')

/** 숙어·읽기에서 뽑은 문자 + 가나 전 구간. 입력 필드·음독 표시가 폴백을 타지 않게 한다 */
function targetCodePoints(): Set<number> {
  const cps = new Set<number>()
  const add = (s: string) => {
    for (const ch of s) cps.add(ch.codePointAt(0)!)
  }

  const files = ['base.json', ...(withBand4 ? ['band4.json'] : [])]
  let idiomCount = 0
  for (const f of files) {
    const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, f), 'utf8')) as {
      idioms: { headword: string; reading: string }[]
    }
    for (const it of idioms) {
      add(it.headword)
      add(it.reading)
      idiomCount++
    }
  }

  // 히라가나 U+3041–3096 (3097·3098 미배정) + 결합기호 3099–309F, 가타카나 U+30A1–30FF, 々〆〇
  for (let cp = 0x3041; cp <= 0x3096; cp++) cps.add(cp)
  for (let cp = 0x3099; cp <= 0x309f; cp++) cps.add(cp)
  for (let cp = 0x30a1; cp <= 0x30ff; cp++) cps.add(cp)
  for (const ch of '　、。・「」『』（）〜〰々〆〇ー') cps.add(ch.codePointAt(0)!)

  console.log(`대상: 숙어 ${idiomCount} · 문자 ${cps.size}${withBand4 ? ' (밴드 4 포함)' : ''}`)
  return cps
}

/** 소스·문서에서 한글을 긁는다. UI 문구가 사전에 없는 글자를 쓰는 경우를 덮는다 */
function scanKorean(dir: string, exts: string[], into: Set<number>): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      scanKorean(full, exts, into)
      continue
    }
    if (!exts.some((e) => name.endsWith(e))) continue
    for (const ch of readFileSync(full, 'utf8')) {
      const cp = ch.codePointAt(0)!
      if (cp >= 0xac00 && cp <= 0xd7a3) into.add(cp)
    }
  }
}

/**
 * 한국어 서브셋 대상. 사전의 뜻·한국 한자음 + 소스·안내서의 UI 문구 + 라틴/기호.
 * 라틴과 기호를 통째로 넣는 이유는 숫자·영문이 한국어 문장에 섞여 나오는데, 그쪽이
 * 폴백을 타면 한 줄 안에서 글꼴이 갈려 더 눈에 띄기 때문이다.
 */
function koreanTargets(): Set<number> {
  const cps = new Set<number>()
  for (let cp = 0x20; cp <= 0x7e; cp++) cps.add(cp)
  for (const ch of '·…—–‘’“”「」『』（）→←↑↓✓✗★☆♪■□●○※•₩°±×÷≤≥≠　、。') {
    cps.add(ch.codePointAt(0)!)
  }

  const addKo = (text: string) => {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!
      if (cp >= 0xac00 && cp <= 0xd7a3) cps.add(cp)
    }
  }
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'base.json'), 'utf8')) as {
    idioms: { koMeaning?: { definition?: string } | null }[]
  }
  for (const it of idioms) addKo(it.koMeaning?.definition ?? '')
  addKo(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8'))

  const root = join(import.meta.dirname, '..')
  scanKorean(join(root, 'src'), ['.ts', '.tsx', '.css'], cps)
  addKo(readFileSync(join(root, 'public', 'guide.html'), 'utf8'))
  addKo(readFileSync(join(root, 'index.html'), 'utf8'))

  const hangul = [...cps].filter((c) => c >= 0xac00 && c <= 0xd7a3).length
  console.log(`한국어 대상: 한글 ${hangul}자 + 라틴/기호 ${cps.size - hangul}자`)
  return cps
}

function charSet(buf: Buffer): Set<number> {
  const font = createFont(buf) as unknown as { characterSet: number[] }
  return new Set(font.characterSet)
}

const show = (cps: number[]) =>
  cps.slice(0, 30).map((cp) => `${String.fromCodePoint(cp)}(U+${cp.toString(16).toUpperCase()})`).join(' ')

/** 한 굵기를 서브셋하고 커버리지를 검증한다. 폴백이 나는 문자가 있으면 false 를 돌려준다 */
async function buildWeight(
  weight: { label: string; src: string; out: string },
  targets: Set<number>,
): Promise<boolean> {
  const srcBuf = readFileSync(weight.src)
  const srcSet = charSet(srcBuf)

  // 서브셋 대상은 "원본이 실제로 가진 문자"로 한정한다. hb-subset 은 없는 문자를 조용히 버린다.
  const text = [...targets].filter((cp) => srcSet.has(cp)).map((cp) => String.fromCodePoint(cp)).join('')
  const outBuf = await subsetFont(srcBuf, text, { targetFormat: 'woff2' })
  writeFileSync(join(OUT_DIR, weight.out), outBuf)

  const outSet = charSet(outBuf)
  const missingFromSource = [...targets].filter((cp) => !srcSet.has(cp))
  const missingFromOutput = [...targets].filter((cp) => srcSet.has(cp) && !outSet.has(cp))
  const covered = [...targets].filter((cp) => outSet.has(cp)).length
  const pct = ((covered / targets.size) * 100).toFixed(2)

  console.log(`\n${weight.out}  ${(outBuf.length / 1024).toFixed(0)} KB  (원본 ${(srcBuf.length / 1024 / 1024).toFixed(1)} MB, ${weight.label})`)
  console.log(`  커버리지 ${pct}%  (${covered}/${targets.size})`)

  if (missingFromSource.length > 0) {
    console.error(`  ✗ 원본에 없는 학습 문자 ${missingFromSource.length}개 — 폴백 발생: ${show(missingFromSource)}`)
  }
  if (missingFromOutput.length > 0) {
    console.error(`  ✗ 서브셋에서 누락 ${missingFromOutput.length}개 (원본엔 있음, hb-subset 버그): ${show(missingFromOutput)}`)
  }
  return missingFromSource.length === 0 && missingFromOutput.length === 0
}

const targets = targetCodePoints()
mkdirSync(OUT_DIR, { recursive: true })

let allCovered = true
for (const weight of JP_WEIGHTS) {
  allCovered = (await buildWeight(weight, targets)) && allCovered
}

const koSrc = readFileSync(SRC_KO)
const koHave = charSet(koSrc)
const koTargets = koreanTargets()
const koText = [...koTargets]
  .filter((cp) => koHave.has(cp))
  .map((cp) => String.fromCodePoint(cp))
  .join('')
const koOut = await subsetFont(koSrc, koText, { targetFormat: 'woff2' })
writeFileSync(join(OUT_DIR, 'Pretendard-Regular.woff2'), koOut)

const koOutSet = charSet(koOut)
const koGap = [...koTargets].filter((cp) => koHave.has(cp) && !koOutSet.has(cp))
console.log(
  `\nPretendard-Regular.woff2  ${(koSrc.length / 1024).toFixed(0)} KB → ` +
    `${(koOut.length / 1024).toFixed(0)} KB  (글리프 ${koOutSet.size}자)`,
)
if (koGap.length > 0) {
  console.error(`  ✗ 한국어 서브셋에서 누락 ${koGap.length}개: ${show(koGap)}`)
  allCovered = false
}

if (!allCovered) {
  console.error(`\n검증 실패. 폴백 0 조건을 못 지킨다.`)
  process.exit(1)
}
console.log(`\n✓ Regular·Bold 둘 다 학습 대상 문자 100% 커버, 폴백 발생 0`)
