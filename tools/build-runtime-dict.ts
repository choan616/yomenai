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
    | { definition: string; glossEn?: string[]; source: 'stdict' | 'llm' | 'manual'; verified: boolean }
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
  /**
   * 같은 표기의 *다른* 읽기 (동형이독). 겹치는 표기가 없으면 아예 안 싣는다.
   * 읽기 채점이 이걸 정답으로 받는다 — 아래 「같은 표기 정리」 주석 참조
   */
  altReadings?: string[]
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

// ── 같은 표기 정리 (2026-09-14) ──
// 두 가지가 섞여 있어 다르게 다룬다.
//
// 1. **표기도 읽기도 같은 쌍** — JMdict 에서 한 말이 두 id 로 갈라져 들어온 것이다.
//    짝은 늘 「검수된 밴드 0~3」 + 「한국어 뜻도 분류도 없는 밴드 4 껍데기」 다.
//    밴드 4 쪽을 버린다. 같은 카드가 두 번 나오는 것을 막는 자리다
// 2. **표기는 같고 읽기가 다른 동형이독** (市場 いちば/しじょう) — 안 지운다.
//    읽기 카드는 한자만 보여 주므로 사용자는 어느 쪽을 묻는지 알 방법이 없다.
//    한쪽을 지우면 멀쩡한 단어가 학습 대상에서 빠지고, 그대로 두면 맞는 답이
//    오답이 된다. 그래서 서로의 읽기를 altReadings 로 실어 채점이 둘 다 받게 한다
//    (`isCorrectReading`). 밴드 4 까지 합쳐 계산한다 — 밴드 4 를 안 켠 사용자가
//    그 읽기를 써도 일본어로는 맞는 답이라 오답 처리할 이유가 없다
// 구분자는 공백이면 충분하다 — 표기에도 읽기에도 공백이 없다
const keyOf = (r: RuntimeIdiom) => r.headword + ' ' + r.reading
// 겹치면 누구를 남기나. 밴드가 낮은 쪽(= 검수를 돌린 쪽) → common → 작은 id 순.
// 마지막 id 비교는 동점을 없애려는 것이다 — 입력 순서에 결과가 흔들리면 안 된다
const better = (a: RuntimeIdiom, b: RuntimeIdiom) => {
  if (a.band !== b.band) return a.band < b.band ? a : b
  if (a.common !== b.common) return a.common ? a : b
  return a.id < b.id ? a : b
}
const keep = new Map<string, RuntimeIdiom>()
for (const r of [...base, ...band4]) {
  const k = keyOf(r)
  const cur = keep.get(k)
  keep.set(k, cur ? better(cur, r) : r)
}
const droppedTwins = base.length + band4.length - keep.size
const kept = new Set(keep.values())
const baseKept = base.filter((r) => kept.has(r))
const band4Kept = band4.filter((r) => kept.has(r))
base.length = 0
base.push(...baseKept)
band4.length = 0
band4.push(...band4Kept)

const readingsOf = new Map<string, Set<string>>()
for (const r of [...base, ...band4]) {
  const set = readingsOf.get(r.headword)
  if (set) set.add(r.reading)
  else readingsOf.set(r.headword, new Set([r.reading]))
}
let homographs = 0
for (const r of [...base, ...band4]) {
  const all = readingsOf.get(r.headword)
  if (!all || all.size < 2) continue
  r.altReadings = [...all].filter((x) => x !== r.reading).sort()
  homographs++
}
console.log(
  '표기+읽기가 겹친 항목 ' + droppedTwins + '개 버림 · 동형이독 ' +
    homographs + '개에 altReadings',
)

const meta = {
  source: 'JMdict_e + KANJIDIC2 + stdict 대조 (EDRDG / 국립국어원)',
  license: 'CC BY-SA 4.0 (JMdict/KANJIDIC2), stdict 별도',
  generatedAt: new Date().toISOString(),
}

const pairs: Record<string, { kanji: string; base: string; kind: 'on' | 'kun' }> = {}
for (const [id, p] of Object.entries(pairsRaw)) {
  pairs[id] = { kanji: p.kanji, base: p.base, kind: p.kind }
}

// 한국음 override — korean-reading-overrides.json 이 있으면 kr(지금 쓰는 음) / krOld(옛·드문 음)
// 로 나눠 싣는다. 없으면 koreanH 를 그대로 kr 에, krOld 는 빈 배열. (없으면 현행 동작 그대로)
const krOverride: Record<string, { now: string[]; old: string[] }> = existsSync(
  join(DICT_DIR, 'korean-reading-overrides.json'),
)
  ? read<{ byChar: Record<string, { now: string[]; old: string[] }> }>(
      'korean-reading-overrides.json',
    ).byChar
  : {}

const kanjiSlim: Record<string, { kr: string[]; krOld: string[]; on: string[]; kun: string[] }> = {}
let krOverridden = 0
for (const ch of [...usedKanji].sort()) {
  const k = kanji[ch]
  const ov = krOverride[ch]
  if (ov) krOverridden++
  kanjiSlim[ch] = {
    kr: ov ? ov.now : k.koreanH,
    krOld: ov ? ov.old : [],
    on: k.onyomi,
    kun: k.kunyomi,
  }
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
console.log(
  `  한국음 override ${krOverridden}자 적용` +
    (krOverridden === 0 ? ' (korean-reading-overrides.json 없음 — koreanH 그대로)' : ''),
)

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
