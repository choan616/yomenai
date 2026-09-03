// JMdict 원본 XML에서 한자만으로 된 숙어를 골라 읽기·품사·우선순위 태그와 함께 사전 DB로 굳히는 빌드 스크립트
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import {
  DICT_DIR,
  findRawFile,
  isKanjiOnly,
  componentKanji,
  type IdiomRecord,
} from './lib/dict.ts'

type El = Record<string, unknown>
const asArray = <T,>(v: T | T[] | undefined): T[] =>
  v == null ? [] : Array.isArray(v) ? v : [v]
const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : String((v as El)?.['#text'] ?? '')
// <pos>&adj-no;</pos> → "adj-no"
const posCode = (v: unknown): string => text(v).replace(/[^A-Za-z0-9-]/g, '')

interface KanjiFile {
  kanji: Record<string, { jouyou: boolean }>
}

function main() {
  const kanji = (
    JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as KanjiFile
  ).kanji
  if (!kanji || Object.keys(kanji).length === 0) {
    throw new Error('data/dict/kanji.json 이 비어 있다. import:kanjidic 먼저 실행.')
  }

  const gzPath = findRawFile('JMdict_e', '.gz')
  let xml = gunzipSync(readFileSync(gzPath)).toString('utf8')
  // 내부 DTD subset 제거 — 엔티티(&n; 등)를 확장하지 않고 코드로 보존한다
  xml = xml.replace(/<!DOCTYPE[^[]*\[[\s\S]*?\]>/, '')

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) =>
      ['entry', 'k_ele', 'r_ele', 'sense', 'pos', 'gloss', 'ke_pri', 're_pri', 're_restr'].includes(
        name,
      ),
  })
  const doc = parser.parse(xml) as { JMdict: { entry: El[] } }
  const entries = doc.JMdict.entry

  const out: IdiomRecord[] = []
  let scanned = 0
  let kanjiIdiomCandidates = 0
  let droppedNoKanjidic = 0
  let droppedHyogai = 0

  for (const entry of entries) {
    scanned++
    const kEles = asArray(entry.k_ele as El | El[] | undefined)
    // 두 글자 이상 한자 표기 표제어 중 첫 번째를 대표로
    const kEle = kEles.find((k) => {
      const keb = text(k.keb)
      return isKanjiOnly(keb) && [...keb].length >= 2
    })
    if (!kEle) continue
    kanjiIdiomCandidates++

    const headword = text(kEle.keb)
    const components = componentKanji(headword)
    if (components.some((c) => !(c in kanji))) {
      droppedNoKanjidic++
      continue
    }
    if (components.some((c) => !kanji[c].jouyou)) {
      droppedHyogai++
      continue
    }

    // 대표 표제어에 적용되는 읽기 (re_restr 없거나 이 표제어를 포함)
    const rEles = asArray(entry.r_ele as El | El[] | undefined)
    const rEle =
      rEles.find((r) => {
        const restr = asArray(r.re_restr as string | string[] | undefined).map(text)
        return r.re_nokanji === undefined && (restr.length === 0 || restr.includes(headword))
      }) ?? rEles[0]
    if (!rEle) continue
    const reading = text(rEle.reb)

    const senses = asArray(entry.sense as El | El[] | undefined)
    const pos = [...new Set(senses.flatMap((s) => asArray(s.pos).map(posCode)).filter(Boolean))]
    const glossEn = [
      ...new Set(senses.flatMap((s) => asArray(s.gloss).map(text)).filter(Boolean)),
    ]
    const priority = [
      ...new Set([
        ...asArray(kEle.ke_pri as string | string[] | undefined).map(text),
        ...asArray(rEle.re_pri as string | string[] | undefined).map(text),
      ]),
    ]

    out.push({
      id: String(text(entry.ent_seq)),
      headword,
      reading,
      pos,
      priority,
      common: priority.length > 0,
      glossEn,
      length: [...headword].length,
    })
  }

  mkdirSync(DICT_DIR, { recursive: true })
  const meta = {
    source: 'JMdict_e (EDRDG)',
    license: 'CC BY-SA 4.0',
    downloadedAt: '2026-09-03',
    generatedAt: new Date().toISOString(),
    count: out.length,
  }
  writeFileSync(join(DICT_DIR, 'idioms.json'), JSON.stringify({ _meta: meta, idioms: out }))

  const lenHist: Record<string, number> = {}
  const withPri = out.filter((i) => i.priority.length > 0).length
  for (const i of out) {
    const key = i.length >= 5 ? '5+' : String(i.length)
    lenHist[key] = (lenHist[key] ?? 0) + 1
  }

  console.log(`JMdict entry 총 ${scanned}개 스캔`)
  console.log(`  한자 표기 숙어 후보 ${kanjiIdiomCandidates}개`)
  console.log(`  제외 — KANJIDIC 미등재 한자 포함 ${droppedNoKanjidic}개`)
  console.log(`  제외 — 표외자(비상용) 포함 ${droppedHyogai}개`)
  console.log(`  최종 숙어 ${out.length}개 (우선순위 태그 보유 ${withPri}개)`)
  console.log(`  글자수 분포 ${JSON.stringify(lenHist)}`)
  console.log(`  → ${join(DICT_DIR, 'idioms.json')}`)
}

main()
