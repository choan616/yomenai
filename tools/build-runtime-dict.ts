// 빌드타임 사전 산출물을 런타임이 바로 쓰는 분할 JSON 번들로 조립한다 (PLAN §5, context-notes 미확정 #1)
//   base.json      밴드 0~3 (기본 번들)
//   band4.json     밴드 4   (opt-in 지연 로드)
//   pairs.json     (한자, 음독) 쌍 사전 — 음독 맵 화면
//   kanji.json     런타임 등장 한자만 추린 한국 한자음·음훈독 — 오답 상세 화면
//   examples.json  Tatoeba 무번역 예문 (Phase 6, 있으면만 — data/dict/examples.json 이 없으면 건너뜀)
// 사전 DB 는 읽기 전용 재생성 산출물이다. 사용자 DB(IndexedDB)와 절대 섞지 않는다.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pairId } from '../src/lib/onyomi.ts'
import { DICT_DIR } from './lib/dict.ts'

const OUT_DIR = join(import.meta.dirname, '..', 'public', 'dict')

type Band = 0 | 1 | 2 | 3 | 4
type Seg = [kanji: string, surface: string, base: string, kind: 'on' | 'kun', variants: string[]]

interface RawIdiom {
  id: string
  headword: string
  reading: string
  pos: string[]
  priority: string[]
  common: boolean
  glossEn: string[]
  length: number
}

interface KoClass {
  category: 1 | 2 | 3
  classSource: 'manual' | 'llm' | 'default'
  koMeaning:
    | { word: string; origin: string; definition: string; source: string; verified: boolean }
    | null
}

interface KanjiRow {
  literal: string
  onyomi: string[]
  kunyomi: string[]
  koreanH: string[]
}

/** 런타임 숙어 레코드. `src/dict/load.ts` 의 `RuntimeIdiom` 과 형태가 같아야 한다 */
interface RuntimeIdiom {
  id: string
  headword: string
  reading: string
  pos: string[]
  band: Band
  common: boolean
  /** 밴드 0~3 만 한국어 대조를 돌렸다. 밴드 4 는 null → 로더가 확장(2)/default 로 채운다 */
  category: 1 | 2 | 3 | null
  classSource: 'manual' | 'llm' | 'default' | null
  koMeaning: KoClass['koMeaning']
  /** 구성 (한자, 음독) 쌍 id. 재생·미숙 음독 가중이 쓴다 */
  pairIds: string[]
}

function read<T>(file: string): T {
  return JSON.parse(readFileSync(join(DICT_DIR, file), 'utf8')) as T
}

const idioms = read<{ idioms: RawIdiom[] }>('idioms.json').idioms
const bands = read<{ byId: Record<string, Band> }>('bands.json').byId
const byIdiom = read<{ byIdiom: Record<string, Seg[]> }>('onyomi-map.json').byIdiom
const pairsRaw = read<{ pairs: Record<string, { kanji: string; base: string; kind: 'on' | 'kun' }> }>(
  'onyomi-map.json',
).pairs
const koClass = read<{ byId: Record<string, KoClass> }>('korean-class.json').byId
const kanji = read<{ kanji: Record<string, KanjiRow> }>('kanji.json').kanji

const base: RuntimeIdiom[] = []
const band4: RuntimeIdiom[] = []
const usedKanji = new Set<string>()

for (const it of idioms) {
  const band = bands[it.id]
  const segs = byIdiom[it.id]
  // 음독 분해가 없는 숙어(熟字訓·当て字)는 학습 대상이 아니다 — Phase 2 의 설계된 거부
  if (band === undefined || segs === undefined) continue

  const ko = koClass[it.id]
  const rec: RuntimeIdiom = {
    id: it.id,
    headword: it.headword,
    reading: it.reading,
    pos: it.pos,
    band,
    common: it.common,
    category: ko?.category ?? null,
    classSource: ko?.classSource ?? null,
    koMeaning: ko?.koMeaning ?? null,
    pairIds: segs.map(([k, , b, kind]) => pairId(k, b, kind)),
  }
  ;(band <= 3 ? base : band4).push(rec)
  for (const ch of it.headword) if (kanji[ch]) usedKanji.add(ch)
}

const meta = {
  source: 'JMdict_e + KANJIDIC2 + stdict 대조 (EDRDG / 국립국어원)',
  license: 'CC BY-SA 4.0 (JMdict/KANJIDIC2), stdict 별도',
  generatedAt: new Date().toISOString(),
}

const pairs: Record<string, { kanji: string; base: string; kind: 'on' | 'kun' }> = {}
for (const [id, p] of Object.entries(pairsRaw)) {
  pairs[id] = { kanji: p.kanji, base: p.base, kind: p.kind }
}

const kanjiSlim: Record<string, { kr: string[]; on: string[]; kun: string[] }> = {}
for (const ch of [...usedKanji].sort()) {
  const k = kanji[ch]
  kanjiSlim[ch] = { kr: k.koreanH, on: k.onyomi, kun: k.kunyomi }
}

mkdirSync(OUT_DIR, { recursive: true })
const emit = (file: string, body: unknown) => {
  const path = join(OUT_DIR, file)
  writeFileSync(path, JSON.stringify(body))
  const kb = (readFileSync(path).length / 1024).toFixed(0)
  console.log(`  ${file.padEnd(12)} ${kb.padStart(7)} KB`)
}

console.log(`public/dict/ 에 씀:`)
emit('base.json', { _meta: { ...meta, band: '0~3', count: base.length }, idioms: base })
emit('band4.json', { _meta: { ...meta, band: '4', count: band4.length }, idioms: band4 })
emit('pairs.json', { _meta: meta, pairs })
emit('kanji.json', { _meta: meta, kanji: kanjiSlim })

// Tatoeba 예문 — data/dict/examples.json 이 없으면 조용히 건너뛴다 (원본이 큰 수동 다운로드라
// 다들 받아두는 게 아니다). `npm run build:examples` 로 만든다
const examplesPath = join(DICT_DIR, 'examples.json')
if (existsSync(examplesPath)) {
  const src = read<{ _meta: { source: string; rule: string }; byId: Record<string, string[]> }>(
    'examples.json',
  )
  const inRuntime = new Set([...base, ...band4].map((r) => r.id))
  const examples: Record<string, string[]> = {}
  for (const [id, sentences] of Object.entries(src.byId)) {
    if (inRuntime.has(id)) examples[id] = sentences
  }
  emit('examples.json', {
    _meta: { ...meta, source: src._meta.source, rule: src._meta.rule, idiomCount: Object.keys(examples).length },
    byId: examples,
  })
} else {
  console.log('  examples.json   건너뜀 (data/dict/examples.json 없음 — npm run build:examples)')
}

console.log(
  `\nbase ${base.length} · band4 ${band4.length} · pairs ${Object.keys(pairs).length} · kanji ${
    Object.keys(kanjiSlim).length
  }`,
)
