// 숙어별 난이도 밴드를 산정해 data/dict/bands.json 으로 굳히고 분포를 출력하는 빌드 스크립트
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { bandOf, BAND_LABEL, minNf, type Band } from '../src/lib/bands.ts'

export interface BandDistribution {
  total: number
  byBand: Record<string, number>
  /** 밴드 4 중 우선순위 태그는 있으나 nf 빈도 순위가 없는 항목 (ichi1/spec1/gai1 등) */
  band4Common: number
}

export function computeDistribution(idioms: IdiomRecord[]): BandDistribution {
  const byBand: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
  let band4Common = 0
  for (const it of idioms) {
    const b = bandOf(it)
    byBand[String(b)]++
    if (b === 4 && it.priority.length > 0) band4Common++
  }
  return { total: idioms.length, byBand, band4Common }
}

function main() {
  const { idioms } = JSON.parse(
    readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8'),
  ) as { idioms: IdiomRecord[] }

  const byId: Record<string, Band> = {}
  for (const it of idioms) byId[it.id] = bandOf(it)
  const dist = computeDistribution(idioms)

  const out = {
    _meta: {
      source: 'JMdict_e ke_pri/re_pri (EDRDG)',
      rule: 'nf 빈도 순위 단독. 0:nf01-10 1:nf11-20 2:nf21-24 3:nf25-48 4:nf 없음',
      generatedAt: new Date().toISOString(),
    },
    distribution: dist,
    byId,
  }
  const outPath = join(DICT_DIR, 'bands.json')
  writeFileSync(outPath, JSON.stringify(out))

  const pct = (n: number) => ((n / dist.total) * 100).toFixed(1) + '%'
  console.log(`=== 밴드 분포 (총 ${dist.total}) ===`)
  for (const b of [0, 1, 2, 3, 4] as Band[]) {
    const n = dist.byBand[String(b)]
    console.log(`  밴드 ${b} (${BAND_LABEL[b]}): ${n} (${pct(n)})`)
  }
  console.log(`\n  * 밴드 4 중 우선순위 태그 보유(빈도 순위 없음): ${dist.band4Common}`)
  const learnable = dist.byBand['0'] + dist.byBand['1'] + dist.byBand['2'] + dist.byBand['3']
  console.log(`  * 기본 학습 대상(밴드 0~3): ${learnable} (${pct(learnable)})`)

  // nf 번호별 히스토그램 — 경계 검수용
  const nfHist = new Map<number, number>()
  for (const it of idioms) {
    const n = minNf(it.priority)
    if (n !== null) nfHist.set(n, (nfHist.get(n) ?? 0) + 1)
  }
  console.log('\n  nf 번호별 숙어 수 (밴드 경계 확인):')
  for (const n of [...nfHist.keys()].sort((a, b) => a - b)) {
    const mark = n === 10 || n === 20 || n === 24 ? '  <- 밴드 경계' : ''
    if (n <= 26 || n >= 46) console.log(`    nf${String(n).padStart(2, '0')}: ${nfHist.get(n)}${mark}`)
  }
  console.log(`\n  → ${outPath}`)
}

if (import.meta.filename === process.argv[1]) main()
