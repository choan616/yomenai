// KANJIDIC2(JSON 변환본)에서 한자별 학년·빈도·음훈독·한국 한자음을 추출해 사전 DB로 굳히는 빌드 스크립트
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const RAW_DIR = join(import.meta.dirname, '..', 'data', 'raw')
const OUT_DIR = join(import.meta.dirname, '..', 'data', 'dict')

// data/raw 안의 kanjidic2-all-*.json 파일을 자동으로 찾는다 (버전 문자열이 바뀌어도 대응)
function findRawFile(prefix: string): string {
  const hit = readdirSync(RAW_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.json'))
  if (!hit) throw new Error(`${RAW_DIR} 에서 ${prefix}*.json 을 찾지 못했다. 다운로드 먼저.`)
  return join(RAW_DIR, hit)
}

interface Kd2Reading {
  type: string
  value: string
}
interface Kd2Meaning {
  lang: string
  value: string
}
interface Kd2Character {
  literal: string
  misc: {
    grade: number | null
    strokeCounts: number[]
    frequency: number | null
    jlptLevel: number | null
  }
  readingMeaning: {
    groups: { readings: Kd2Reading[]; meanings: Kd2Meaning[] }[]
    nanori: string[]
  } | null
}
interface Kd2File {
  version: string
  dictDate: string
  databaseVersion: string
  characters: Kd2Character[]
}

// 사전 DB에 저장할 한자 1자 레코드. 출처는 필드 단위가 아니라 레코드 단위로 kanjidic2 고정
export interface KanjiRecord {
  literal: string
  grade: number | null // 1~6 교육한자, 8 상용한자 나머지, 9~10 인명용, null 표외
  jouyou: boolean // grade 1~8
  freq: number | null // 신문 빈도 순위 1~2501 (없으면 null)
  jlpt: number | null // KANJIDIC 옛 JLPT 등급 (참고용, 난이도 축 아님)
  strokeCount: number | null
  onyomi: string[] // 카타카나
  kunyomi: string[] // 히라가나, おく.る 형태의 마침표 포함
  koreanH: string[] // 한국 한자음 (한글). 없을 수 있음
  meaningsEn: string[] // 영어 뜻 (DB 보관용, 화면 비표시)
}

function extract(char: Kd2Character): KanjiRecord {
  const readings: Kd2Reading[] = []
  const meanings: string[] = []
  for (const g of char.readingMeaning?.groups ?? []) {
    readings.push(...g.readings)
    for (const m of g.meanings) if (m.lang === 'en') meanings.push(m.value)
  }
  const byType = (t: string) => readings.filter((r) => r.type === t).map((r) => r.value)
  const grade = char.misc.grade
  return {
    literal: char.literal,
    grade,
    jouyou: grade != null && grade >= 1 && grade <= 8,
    freq: char.misc.frequency,
    jlpt: char.misc.jlptLevel,
    strokeCount: char.misc.strokeCounts?.[0] ?? null,
    onyomi: byType('ja_on'),
    kunyomi: byType('ja_kun'),
    koreanH: byType('korean_h'),
    meaningsEn: meanings,
  }
}

function main() {
  const srcPath = findRawFile('kanjidic2-all-')
  const raw = JSON.parse(readFileSync(srcPath, 'utf8')) as Kd2File
  const records: Record<string, KanjiRecord> = {}
  let withKorean = 0
  let jouyouCount = 0
  for (const char of raw.characters) {
    const rec = extract(char)
    records[rec.literal] = rec
    if (rec.koreanH.length > 0) withKorean++
    if (rec.jouyou) jouyouCount++
  }

  mkdirSync(OUT_DIR, { recursive: true })
  const out = {
    _meta: {
      source: 'kanjidic2 (jmdict-simplified 변환본)',
      license: 'CC BY-SA 4.0',
      dictDate: raw.dictDate,
      databaseVersion: raw.databaseVersion,
      generatedAt: new Date().toISOString(),
      count: Object.keys(records).length,
    },
    kanji: records,
  }
  writeFileSync(join(OUT_DIR, 'kanji.json'), JSON.stringify(out))

  console.log(`kanjidic2 ${raw.dictDate} (db ${raw.databaseVersion})`)
  console.log(`  한자 총 ${out._meta.count}자`)
  console.log(`  상용(grade 1~8) ${jouyouCount}자`)
  console.log(`  korean_h 보유 ${withKorean}자`)
  console.log(`  → ${join(OUT_DIR, 'kanji.json')}`)
}

main()
