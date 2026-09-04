// 밴드 산정 결과를 육안 검수하기 위해 밴드별 무작위 표본과 경계(nf20/nf21) 인접 표본을 출력하는 스크립트
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { bandOf, BAND_LABEL, minNf, type Band } from '../src/lib/bands.ts'

// 검수 표본이 실행마다 바뀌면 재현이 안 되므로 시드 고정 PRNG(mulberry32)를 쓴다
function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function sample<T>(arr: T[], n: number, seed: number): T[] {
  const r = rng(seed)
  const idx = [...arr.keys()]
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[idx[i], idx[j]] = [idx[j], idx[i]]
  }
  return idx.slice(0, n).map((i) => arr[i])
}

const fmt = (it: IdiomRecord) => {
  const nf = minNf(it.priority)
  return `${it.headword}(${it.reading})${nf === null ? '' : ` nf${String(nf).padStart(2, '0')}`}`
}

function main() {
  const { idioms } = JSON.parse(
    readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8'),
  ) as { idioms: IdiomRecord[] }

  const SEED = 20260903

  for (const b of [0, 1, 2, 3, 4] as Band[]) {
    const pool = idioms.filter((i) => bandOf(i) === b)
    console.log(`\n=== 밴드 ${b} — ${BAND_LABEL[b]} (${pool.length}개 중 30 표본) ===`)
    for (const it of sample(pool, 30, SEED + b)) console.log(`  ${fmt(it)}  ${it.glossEn[0] ?? ''}`)
  }

  // 밴드 4 안에서 우선순위 태그만 있는 부분집합은 성격이 달라 따로 본다
  const b4common = idioms.filter((i) => bandOf(i) === 4 && i.priority.length > 0)
  console.log(`\n=== 밴드 4 중 태그 보유(빈도 순위 없음) (${b4common.length}개 중 30 표본) ===`)
  for (const it of sample(b4common, 30, SEED + 9))
    console.log(`  ${it.headword}(${it.reading}) [${it.priority.join(',')}]  ${it.glossEn[0] ?? ''}`)

  // 밴드 경계 집중 검수 — nf20(밴드 1 끝) 대 nf21(밴드 2 시작)
  for (const [n, label] of [
    [20, '밴드 1 끝'],
    [21, '밴드 2 시작'],
    [24, '밴드 2 끝'],
    [25, '밴드 3 시작'],
  ] as [number, string][]) {
    const pool = idioms.filter((i) => minNf(i.priority) === n)
    console.log(`\n--- nf${n} (${label}) ${pool.length}개 중 20 표본 ---`)
    console.log('  ' + sample(pool, 20, SEED + 100 + n).map(fmt).join('  '))
  }
}

main()
