// 읽기를 로마자로 펴서 자판에 어떤 글자가 실제로 필요한지 센다 (2026-09-20).
// 안 쓰는 키를 빼면 남은 키가 커진다 — 다만 **추측으로 빼면 못 치는 읽기가 생기므로** 세어 본다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toRomaji } from 'wanakana'

const DIST = join(import.meta.dirname, '..', 'public', 'dict')
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz']

function tally(file: string): { n: number; count: Record<string, number> } {
  const rows = JSON.parse(readFileSync(join(DIST, file), 'utf8')).idioms as { reading: string }[]
  const count: Record<string, number> = {}
  for (const it of rows) {
    for (const ch of toRomaji(it.reading)) {
      if (ch >= 'a' && ch <= 'z') count[ch] = (count[ch] ?? 0) + 1
    }
  }
  return { n: rows.length, count }
}

const base = tally('base.json')
const band4 = tally('band4.json')
console.log(`밴드 0~3 ${base.n}개 · 밴드 4 ${band4.n}개`)
for (const l of LETTERS) {
  console.log(`  ${l}  ${String(base.count[l] ?? 0).padStart(7)}  ${String(band4.count[l] ?? 0).padStart(7)}`)
}
const unused = LETTERS.filter((l) => !base.count[l] && !band4.count[l])
console.log(`\n한 번도 안 쓰이는 글자: ${unused.join(' ') || '(없음)'}`)
console.log('대체 표기도 안전한지 — si·tu·ti·hu·zi 로 쳐도 위 목록에 든 글자만 쓴다')
