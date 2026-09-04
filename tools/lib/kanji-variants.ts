// KANJIDIC2 원본에서 신자체↔정자(구자체) 이체자 집합을 뽑는다. stdict 原語(정자) 대조용
import { readFileSync } from 'node:fs'
import { findRawFile } from './dict.ts'

interface RawKanjidic {
  characters: {
    literal: string
    misc?: { variants?: { type: string; value: string }[] }
  }[]
}

// JIS X 0208 구텐 코드(P-RR-CC)를 EUC-JP로 인코딩해 문자로 되돌린다.
// KANJIDIC 의 jis208 variant 는 대부분 해당 한자의 정자(구자체)를 가리킨다.
const eucjp = new TextDecoder('euc-jp')
function kutenToChar(value: string): string | null {
  const parts = value.split('-').map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null
  const [plane, row, cell] = parts
  if (plane !== 1) return null // jis212/213 은 되돌림이 불안정해 제외 (j64→簗 같은 오디코드)
  const ch = eucjp.decode(Buffer.from([0xa0 + row, 0xa0 + cell]))
  return ch.length === 1 && ch !== '�' ? ch : null
}

/**
 * 신자체 → {정자, …} 매핑. 양방향으로 채운다(정자 → 신자체도 포함).
 * 弁(辨/瓣/辯…)처럼 한 신자체가 복수 정자에 대응하는 경우도 그대로 담는다 —
 * 대조는 집합 소속 검사이므로 과포함이어도 다른 위치·독음 조건이 오탐을 막는다.
 */
export function loadVariantSets(): Map<string, Set<string>> {
  const raw = JSON.parse(
    readFileSync(findRawFile('kanjidic2-all', '.json'), 'utf8'),
  ) as RawKanjidic
  const sets = new Map<string, Set<string>>()
  const link = (a: string, b: string) => {
    if (a === b) return
    ;(sets.get(a) ?? sets.set(a, new Set()).get(a)!).add(b)
    ;(sets.get(b) ?? sets.set(b, new Set()).get(b)!).add(a)
  }
  for (const c of raw.characters) {
    if ([...c.literal].length !== 1) continue
    for (const v of c.misc?.variants ?? []) {
      if (v.type !== 'jis208') continue
      const other = kutenToChar(v.value)
      if (other) link(c.literal, other)
    }
  }
  return sets
}
