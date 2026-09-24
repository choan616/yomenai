// 학습 사전 밖 표제어를 **조회 전용**으로 뽑는다 (2026-09-25, 사용자 제안)
//
// 왜 따로 만드나. `import-jmdict.ts` 가 표제어를 이루는 한자 중 하나라도 상용 밖이면
// 항목을 통째로 버린다. 학습 대상을 고르는 잣대로는 맞지만 **찾을 수 있는 범위의 잣대로는
// 근거가 없다** — 책에 나오는 글자와 상용한자표는 다른 집합이다. `爆轟`·`躊躇`·`邂逅` 가
// 그래서 앱 어디에도 안 나온다.
//
// **기존 사전을 안 건드리는 것이 요점이다.** 여기서 나온 것은 `base.json`·`band4.json` 에
// 섞이지 않는다. 그래서 밴드 재계산도, 음독맵 재생성도, 검수 결과 이전도 없다.
// 되돌리려면 이 파일만 지우면 된다.
//
// **조회 전용이라 모양이 다르다.** 밴드·분류·음독 쌍·`readingKind` 를 안 싣는다. 학습
// 파이프라인에 들어갈 물건이 아니므로 그 칸들이 있으면 오히려 거짓말이 된다. 담기를 열지는
// 화면이 생긴 뒤에 정한다 (`context-notes.md` 2026-09-24).
//
// 한자 정보도 같이 싣는다 — 런타임 `kanji.json` 은 학습 사전에 나오는 2,130자뿐이라
// `轟` 의 한국 한자음이 없다. 없으면 찾기 결과에 「—」가 뜬다.
//
// 출력 — public/dict/wide.json (프리캐시에서 빼고 런타임 캐시로 받는다. band4 와 같은 관례)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { XMLParser } from 'fast-xml-parser'
import { DICT_DIR, findRawFile, isKanjiOnly } from './lib/dict.ts'

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'dict')

type El = Record<string, unknown>
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : String((v as El)?.['#text'] ?? '')
const posCode = (v: unknown): string => text(v).replace(/[^A-Za-z0-9-]/g, '')
const isIrregularForm = (k: El): boolean =>
  asArray(k.ke_inf as string | string[] | undefined)
    .map(text)
    .some((s) => s.includes('sK') || s.includes('iK') || s.includes('oK'))

interface KanjiRow {
  jouyou: boolean
  koreanH: string[]
  onyomi: string[]
  kunyomi: string[]
}

/** 조회 전용 항목. 학습에 쓰는 칸은 일부러 없다 */
interface WideIdiom {
  id: string
  headword: string
  reading: string
  altReadings?: string[]
  pos: string[]
  glossEn: string[]
}

const kanji = (
  JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as { kanji: Record<string, KanjiRow> }
).kanji

/** 이미 배포 중인 것들 — 겹쳐 싣지 않는다 */
const shipped = new Set<string>()
const shippedKanji = new Set<string>()
for (const f of ['base.json', 'band4.json']) {
  const { idioms } = JSON.parse(readFileSync(join(OUT_DIR, f), 'utf8')) as {
    idioms: { id: string; headword: string }[]
  }
  for (const it of idioms) {
    shipped.add(it.id)
    for (const ch of it.headword) shippedKanji.add(ch)
  }
}

let xml = gunzipSync(readFileSync(findRawFile('JMdict_e', '.gz'))).toString('utf8')
xml = xml.replace(/<!DOCTYPE[^[]*\[[\s\S]*?\]>/, '')
const doc = new XMLParser({
  ignoreAttributes: false,
  isArray: (name) =>
    ['entry', 'k_ele', 'r_ele', 'sense', 'pos', 'gloss', 'ke_pri', 're_pri', 're_restr', 'ke_inf'].includes(
      name,
    ),
}).parse(xml) as { JMdict: { entry: El[] } }

const out: WideIdiom[] = []
const extraKanji: Record<string, { kr: string[]; krOld: string[]; on: string[]; kun: string[] }> = {}
let candidates = 0
let droppedNoKanjidic = 0
let alreadyShipped = 0

for (const entry of doc.JMdict.entry) {
  const kEles = asArray(entry.k_ele as El | El[] | undefined)
  const kEle = kEles.find((k) => {
    const keb = text(k.keb)
    return isKanjiOnly(keb) && [...keb].length >= 2 && !isIrregularForm(k)
  })
  if (!kEle) continue
  const headword = text(kEle.keb)
  const chars = [...headword].filter((c) => c !== '々')
  if (chars.some((c) => !(c in kanji))) {
    droppedNoKanjidic++
    continue
  }
  // **상용만으로 된 것은 여기 대상이 아니다.** 그건 학습 사전이 이미 판단한 몫이다
  if (!chars.some((c) => !kanji[c]!.jouyou)) continue
  candidates++

  const id = String(text(entry.ent_seq))
  if (shipped.has(id)) {
    alreadyShipped++
    continue
  }

  // 이 표기에 적용되는 읽기 전부 — 첫 번째가 대표, 나머지는 찾기 키로만 쓴다
  const readings = asArray(entry.r_ele as El | El[] | undefined)
    .filter((r) => {
      const restr = asArray(r.re_restr as string | string[] | undefined).map(text)
      return r.re_nokanji === undefined && (restr.length === 0 || restr.includes(headword))
    })
    .map((r) => text(r.reb))
    .filter(Boolean)
  if (readings.length === 0) continue

  const senses = asArray(entry.sense as El | El[] | undefined)
  out.push({
    id,
    headword,
    reading: readings[0]!,
    ...(readings.length > 1 ? { altReadings: readings.slice(1) } : {}),
    pos: [...new Set(senses.flatMap((s) => asArray(s.pos).map(posCode)).filter(Boolean))],
    glossEn: [...new Set(senses.flatMap((s) => asArray(s.gloss).map(text)).filter(Boolean))],
  })

  for (const ch of headword) {
    if (ch === '々' || shippedKanji.has(ch) || ch in extraKanji) continue
    const k = kanji[ch]
    if (!k) continue
    // 한국음 override 는 안 본다 — 그 파일은 상용한자 검수분이라 여기 글자가 없다
    extraKanji[ch] = { kr: k.koreanH, krOld: [], on: k.onyomi, kun: k.kunyomi }
  }
}

out.sort((a, b) => a.headword.localeCompare(b.headword, 'ja') || a.id.localeCompare(b.id))

const meta = {
  source: 'JMdict_e (EDRDG)',
  license: 'CC BY-SA 4.0',
  generatedAt: new Date().toISOString(),
  count: out.length,
  note: '학습 사전 밖 표제어 (상용한자 밖 글자를 포함). 조회 전용 — 밴드·음독 쌍이 없다',
}
const path = join(OUT_DIR, 'wide.json')
writeFileSync(path, JSON.stringify({ _meta: meta, idioms: out, kanji: extraKanji }))

const mb = (readFileSync(path).length / 1024 / 1024).toFixed(2)
const noKr = Object.values(extraKanji).filter((k) => k.kr.length === 0).length
console.log('=== 넓힌 사전 ===')
console.log(`  상용 밖 글자를 가진 표제어 ${candidates}개`)
console.log(`    이미 배포 중이라 건너뜀 ${alreadyShipped} · kanjidic 밖 ${droppedNoKanjidic}`)
console.log(`  실은 것 ${out.length}개 · 추가 한자 ${Object.keys(extraKanji).length}자`)
console.log(`    한국 한자음이 없는 글자 ${noKr}자 (화면에서 「—」로 뜬다)`)
console.log(`  → ${path}  ${mb}MB`)
console.log('  뜻은 영어 gloss 뿐이다 — 한국어 번역은 아직 안 돌렸다')
