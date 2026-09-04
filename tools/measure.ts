// 사전 DB 산출물의 규모·분포를 실측해 Phase 1-4 판단 자료를 출력하는 스크립트
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { bandOf } from '../src/lib/bands.ts'

function mb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2) + ' MB'
}

function main() {
  const idiomsPath = join(DICT_DIR, 'idioms.json')
  const kanjiPath = join(DICT_DIR, 'kanji.json')
  const { idioms } = JSON.parse(readFileSync(idiomsPath, 'utf8')) as { idioms: IdiomRecord[] }

  const total = idioms.length

  const lenHist: Record<string, number> = { '2': 0, '3': 0, '4': 0, '5+': 0 }
  const bandHist: Record<string, number> = { '0': 0, '1': 0, '2': 0, '3': 0, '4': 0 }
  for (const it of idioms) {
    lenHist[it.length >= 5 ? '5+' : String(it.length)]++
    bandHist[String(bandOf(it))]++
  }

  // "일본 고유 숙어" 정밀 판정은 Phase 3 한국어 대조가 해야 한다. 여기서는 규모 프록시만 낸다.
  const workingSet = idioms.filter((i) => i.priority.length > 0).length

  const pct = (n: number) => ((n / total) * 100).toFixed(1) + '%'

  console.log('=== Phase 1-4 실측 ===\n')
  console.log(`대상 숙어 총 개수: ${total}`)
  console.log(`  우선순위 태그 보유(밴드 0~3, 사실상 학습 대상): ${workingSet} (${pct(workingSet)})`)
  console.log(`  태그 없음(밴드 4, 선택): ${total - workingSet} (${pct(total - workingSet)})\n`)

  console.log('글자수별 분포:')
  for (const k of ['2', '3', '4', '5+']) console.log(`  ${k}자: ${lenHist[k]} (${pct(lenHist[k])})`)
  console.log()

  console.log('밴드별 분포 (잠정 규칙, Phase 2에서 검수):')
  const bandLabel: Record<string, string> = {
    '0': 'nf01~10  N3 이하',
    '1': 'nf11~20  N2 대',
    '2': 'nf21~48/news1  N2~N1 경계',
    '3': 'news2 등  N1 대',
    '4': '태그 없음  N1 초과',
  }
  for (const k of ['0', '1', '2', '3', '4'])
    console.log(`  밴드 ${k} (${bandLabel[k]}): ${bandHist[k]} (${pct(bandHist[k])})`)
  console.log()

  console.log('사전 DB 용량:')
  const iSize = statSync(idiomsPath).size
  const kSize = statSync(kanjiPath).size
  console.log(`  idioms.json: ${mb(iSize)}`)
  console.log(`  kanji.json:  ${mb(kSize)}`)
  console.log(`  합계(비압축 JSON): ${mb(iSize + kSize)}`)
  console.log(
    `  * 밴드 0~3만 실으면 idioms는 약 ${mb((iSize * workingSet) / total)} 수준으로 축소 가능`,
  )
}

main()
