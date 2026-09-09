// 검수한 korean-reading-review.tsv(now/old 두 열)를 override JSON 으로 굳힌다.
// old 에 내려도 삭제가 아니다 — build-runtime-dict 가 kr(=now) 와 krOld(=old) 로 나눠 싣고
// 오답 상세 화면이 old 를 "옛 음" 으로 접어서 보여준다. koreanH 원본은 안 건드린다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'

const REVIEW = join(DICT_DIR, 'korean-reading-review.tsv')
const OUT = join(DICT_DIR, 'korean-reading-overrides.json')

interface KanjiInfo {
  koreanH: string[]
}

function splitReadings(cell: string): string[] {
  return cell
    .split('·')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function main() {
  if (!existsSync(REVIEW)) {
    console.error(`${REVIEW} 없음. 먼저 npm run audit:korean-readings 로 만들고 now/old 열을 손본다.`)
    process.exit(1)
  }
  const kanji = (
    JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
      kanji: Record<string, KanjiInfo>
    }
  ).kanji

  const lines = readFileSync(REVIEW, 'utf8').trim().split('\n')
  const header = lines[0].split('\t')
  const iChar = header.indexOf('char')
  const iNow = header.indexOf('now')
  const iOld = header.indexOf('old')
  if (iChar < 0 || iNow < 0 || iOld < 0) {
    console.error(`헤더에 char/now/old 열이 있어야 한다. 실제: ${header.join(', ')}`)
    process.exit(1)
  }

  const byChar: Record<string, { now: string[]; old: string[] }> = {}
  const warnings: string[] = []
  for (const line of lines.slice(1)) {
    const f = line.split('\t')
    const ch = f[iChar]?.trim()
    if (!ch) continue
    const now = splitReadings(f[iNow] ?? '')
    const old = splitReadings(f[iOld] ?? '')
    if (old.length === 0) continue // 내릴 게 없으면 override 불필요 — passthrough
    if (now.length === 0) {
      warnings.push(`${ch}: now 가 비었다 — 건너뜀`)
      continue
    }
    const src = new Set(kanji[ch]?.koreanH ?? [])
    for (const r of [...now, ...old]) {
      if ([...r].length !== 1) warnings.push(`${ch}: "${r}" 가 한 글자가 아니다`)
    }
    const dropped = [...src].filter((r) => !now.includes(r) && !old.includes(r))
    if (dropped.length > 0) warnings.push(`${ch}: koreanH 에 있던 ${dropped.join('·')} 가 now/old 어디에도 없다 (완전 삭제됨)`)
    const overlap = now.filter((r) => old.includes(r))
    if (overlap.length > 0) warnings.push(`${ch}: ${overlap.join('·')} 가 now·old 양쪽에 있다`)
    byChar[ch] = { now, old }
  }

  writeFileSync(
    OUT,
    JSON.stringify(
      {
        _meta: {
          note: 'kr(now) / krOld(old) 분리. koreanH 원본 대체가 아니라 표시 순위/접기용',
          source: 'korean-reading-review.tsv (사람 검수)',
          generatedAt: new Date().toISOString(),
          count: Object.keys(byChar).length,
        },
        byChar,
      },
      null,
      1,
    ) + '\n',
  )

  for (const w of warnings) console.log(`  ⚠ ${w}`)
  console.log(`override ${Object.keys(byChar).length}자 → ${OUT}`)
  console.log(`다음: npm run build:runtime-dict`)
}

main()
