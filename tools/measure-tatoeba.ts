// Tatoeba 예문 커버리지를 실측한다 (PLAN §3 "채택 여부 미정", checklist Phase 6
// "부족하면 이 Phase 자체를 뺀다"). 코퍼스 표제어가 Tatoeba 일본어 문장에 얼마나 등장하는지,
// 그 문장에 한국어 번역이 얼마나 딸려 있는지를 잰다. 산출물을 만들지 않는 일회성 조사 도구다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf } from '../src/lib/bands.ts'
import { DICT_DIR, RAW_DIR, type IdiomRecord } from './lib/dict.ts'

const TATOEBA_DIR = join(RAW_DIR, 'tatoeba')

interface Sentence {
  id: string
  text: string
}

function readSentences(): Sentence[] {
  const raw = readFileSync(join(TATOEBA_DIR, 'jpn_sentences_detailed.tsv'), 'utf8')
  const out: Sentence[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const tab1 = line.indexOf('\t')
    const tab2 = line.indexOf('\t', tab1 + 1)
    const tab3 = line.indexOf('\t', tab2 + 1)
    if (tab1 < 0 || tab2 < 0) continue
    const lang = line.slice(tab1 + 1, tab2)
    if (lang !== 'jpn') continue
    const text = tab3 < 0 ? line.slice(tab2 + 1) : line.slice(tab2 + 1, tab3)
    out.push({ id: line.slice(0, tab1), text })
  }
  return out
}

function countLinks(file: string): number {
  const raw = readFileSync(join(TATOEBA_DIR, file), 'utf8')
  return raw.split('\n').filter((l) => l !== '').length
}

function main() {
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const sentences = readSentences()

  // 표제어 첫 글자로 후보를 좁힌 뒤 startsWith 로 확정 — 전수 문자열 검색보다 훨씬 빠르다.
  // 읽기까지 검증하지 않는 순수 표기 매칭이라 동형이의어는 구분 못 한다 (아래 결과에 명시).
  const byFirstChar = new Map<string, { id: string; headword: string }[]>()
  for (const it of idioms) {
    const key = it.headword[0]
    const list = byFirstChar.get(key)
    if (list) list.push({ id: it.id, headword: it.headword })
    else byFirstChar.set(key, [{ id: it.id, headword: it.headword }])
  }

  const matchCount = new Map<string, number>() // idiomId -> 매칭 문장 수
  const sampleOf = new Map<string, string>() // idiomId -> 예시 문장 1개

  for (const s of sentences) {
    const text = s.text
    for (let i = 0; i < text.length; i++) {
      const cands = byFirstChar.get(text[i])
      if (!cands) continue
      for (const c of cands) {
        if (text.startsWith(c.headword, i)) {
          matchCount.set(c.id, (matchCount.get(c.id) ?? 0) + 1)
          if (!sampleOf.has(c.id)) sampleOf.set(c.id, text)
        }
      }
    }
  }

  const byBand: Record<number, { total: number; covered: number }> = {
    0: { total: 0, covered: 0 },
    1: { total: 0, covered: 0 },
    2: { total: 0, covered: 0 },
    3: { total: 0, covered: 0 },
    4: { total: 0, covered: 0 },
  }
  for (const it of idioms) {
    const band = bandOf(it)
    byBand[band].total++
    if ((matchCount.get(it.id) ?? 0) > 0) byBand[band].covered++
  }

  const pct = (n: number, total: number) => (total === 0 ? '—' : ((n / total) * 100).toFixed(1) + '%')

  console.log('=== Tatoeba 예문 커버리지 실측 ===\n')
  console.log(`일본어 문장 총 ${sentences.length.toLocaleString()}개 (jpn_sentences_detailed.tsv)\n`)

  console.log('밴드별 — 표제어가 1개 이상 문장에 등장하는 숙어 비율 (표기 매칭, 읽기 미검증):')
  let base03Total = 0
  let base03Covered = 0
  for (const band of [0, 1, 2, 3, 4] as const) {
    const { total, covered } = byBand[band]
    console.log(`  밴드 ${band}: ${covered}/${total} (${pct(covered, total)})`)
    if (band <= 3) {
      base03Total += total
      base03Covered += covered
    }
  }
  console.log(`  밴드 0~3 합계(기본 학습 대상): ${base03Covered}/${base03Total} (${pct(base03Covered, base03Total)})\n`)

  const withMultiple = [...matchCount.values()].filter((n) => n >= 3).length
  console.log(`문장 3개 이상 확보된 숙어(예문 여러 개 순환 가능): ${withMultiple}\n`)

  console.log('번역 연결 — 예문에 뜻풀이를 같이 보여줄 수 있는지 (jpn-*_links.tsv 링크 수):')
  const koLinks = countLinks('jpn-kor_links.tsv')
  const enLinks = countLinks('jpn-eng_links.tsv')
  console.log(`  jpn-kor: ${koLinks.toLocaleString()}건`)
  console.log(`  jpn-eng: ${enLinks.toLocaleString()}건 (참고용, 화면엔 안 씀 — PLAN §5 "뜻 표시 언어 한국어 단일")`)
  console.log(
    `  → 전체 일본어 문장(${sentences.length.toLocaleString()}) 대비 한국어 번역이 붙은 비율 상한: ` +
      `${pct(koLinks, sentences.length)}\n`,
  )

  console.log('표본 5개 (밴드 0~1, 매칭됨):')
  const sampleIds = idioms
    .filter((it) => bandOf(it) <= 1 && sampleOf.has(it.id))
    .slice(0, 200)
    .sort(() => 0.5 - Math.random())
    .slice(0, 5)
  for (const it of sampleIds) {
    console.log(`  ${it.headword}(${it.reading}) — ${sampleOf.get(it.id)}`)
  }
}

main()
