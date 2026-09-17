// 「한국음 간섭」 판정이 정말 한국 한자음에서 끌려온 오답인지 대조하는 감사 스크립트.
//
// 축 A 는 변형 기반 축(촉음·탁음·장음)만 「근거가 있나」를 물었다. 구조 판정은 변형 태그가
// 없어 같은 잣대를 못 댔다. 여기서 **독립된 잣대**를 세운다 —
// 한국 한자음의 종성과 일본 음독의 꼬리가 어떻게 대응하는지를 코퍼스에서 귀납한다.
//
// 분류기가 쓰는 기준(「형제 한자의 음독이면서 자기 읽기가 아님」)으로 채점하면 **코드가
// 자기를 되읽는 것**이라 뜻이 없다. 그래서 읽기 표만 보고 표를 따로 만든다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decompose, type KanjiReadings } from '../src/lib/onyomi.ts'
import { toHiragana, unvoiceAll } from '../src/lib/readings.ts'
import { buildKoSiblingIndex, explainMistake, type MistakeContext } from '../src/core/mistakes.ts'

const PUB_DIR = join(import.meta.dirname, '..', 'public', 'dict')
const kanjiRaw = JSON.parse(readFileSync(join(PUB_DIR, 'kanji.json'), 'utf8')).kanji as Record<
  string,
  { on: string[]; kun: string[]; kr: string[] }
>
const idioms = JSON.parse(readFileSync(join(PUB_DIR, 'base.json'), 'utf8')).idioms as {
  headword: string
  reading: string
}[]

const lookup = (k: string): KanjiReadings | undefined => {
  const r = kanjiRaw[k]
  return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
}
const forIndex: Record<string, { koreanH: string[]; onyomi: string[] }> = {}
for (const [k, v] of Object.entries(kanjiRaw)) forIndex[k] = { koreanH: v.kr, onyomi: v.on }
const ctx: MistakeContext = { lookup, koSiblingOnyomi: buildKoSiblingIndex(forIndex) }

/* ── 1. 잣대 — 한국음 종성 → 일본 음독 꼬리 대응을 읽기 표에서 귀납한다 ── */

const JONG = ['', 'ㄱ','ㄲ','ㄳ','ㄴ','ㄵ','ㄶ','ㄷ','ㄹ','ㄺ','ㄻ','ㄼ','ㄽ','ㄾ','ㄿ','ㅀ','ㅁ','ㅂ','ㅄ','ㅅ','ㅆ','ㅇ','ㅈ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']

/** 한글 한 음절의 종성. 한글이 아니면 null */
function coda(syllable: string): string | null {
  const cp = syllable.codePointAt(0)
  if (cp === undefined) return null
  const at = cp - 0xac00
  if (at < 0 || at >= 11172) return null
  return JONG[at % 28]
}

/** 음독의 꼬리를 갈래로 — 종성과 대응하는 자리다 */
function tail(reading: string): string {
  const r = toHiragana(reading.replace(/-/g, ''))
  const last = r.at(-1) ?? ''
  if (last === 'く' || last === 'き') return 'く·き'
  if (last === 'つ' || last === 'ち') return 'つ·ち'
  if (last === 'ん') return 'ん'
  if (r.length >= 2 && (last === 'う' || last === 'い')) return 'う·い(장음)'
  return '모음'
}

const table = new Map<string, Map<string, number>>()
for (const rec of Object.values(kanjiRaw)) {
  for (const kr of rec.kr) {
    const c = coda(kr)
    if (c === null) continue
    for (const on of rec.on) {
      const row = table.get(c) ?? new Map<string, number>()
      row.set(tail(on), (row.get(tail(on)) ?? 0) + 1)
      table.set(c, row)
    }
  }
}

console.log('## 잣대 — 한국음 종성 → 음독 꼬리 (읽기 표에서 귀납)')
const codaOrder = ['', 'ㄱ', 'ㄹ', 'ㅁ', 'ㄴ', 'ㅂ', 'ㅇ']
for (const c of codaOrder) {
  const row = table.get(c)
  if (row === undefined) continue
  const total = [...row.values()].reduce((a, b) => a + b, 0)
  const parts = [...row]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${((n / total) * 100).toFixed(0)}%`)
  console.log(`  ${(c === '' ? '(받침없음)' : c + ' 받침').padEnd(12)} ${parts.join(' · ')}   (${total})`)
}

/* ── 2. 대조 — KO_INTERFERENCE 판정이 실제로 어떤 오답인가 ── */

const VOICE: Record<string, string> = {}
for (const [a, b] of [['か','が'],['き','ぎ'],['く','ぐ'],['け','げ'],['こ','ご'],['さ','ざ'],
  ['し','じ'],['す','ず'],['せ','ぜ'],['そ','ぞ'],['た','だ'],['ち','ぢ'],['つ','づ'],['て','で'],
  ['と','ど'],['は','ば'],['ひ','び'],['ふ','ぶ'],['へ','べ'],['ほ','ぼ']]) VOICE[a] = b

/** 한국음이 같은 *다른* 한자의 음독 (자기 읽기와 그 청탁 변이는 뺀다) */
function siblingReadings(kanji: string): string[] {
  const rec = kanjiRaw[kanji]
  if (rec === undefined) return []
  const own = new Set<string>()
  for (const on of rec.on) {
    const t = toHiragana(on.replace(/-/g, ''))
    own.add(t)
    own.add(unvoiceAll(t))
  }
  const out = new Set<string>()
  for (const other of Object.values(kanjiRaw)) {
    if (other === rec) continue
    if (!other.kr.some((k) => rec.kr.includes(k))) continue
    for (const on of other.on) {
      const t = toHiragana(on.replace(/-/g, ''))
      if (!own.has(t) && !own.has(unvoiceAll(t))) out.add(t)
    }
  }
  return [...out].slice(0, 4)
}

const kind = new Map<string, number>()
const samples = new Map<string, string[]>()
const bump = (k: string, s: string) => {
  kind.set(k, (kind.get(k) ?? 0) + 1)
  const list = samples.get(k) ?? []
  if (list.length < 8) list.push(s)
  samples.set(k, list)
}

for (const it of idioms) {
  const d = decompose(it.headword, it.reading, lookup)
  if (!d.ok) continue
  let off = 0
  for (const s of d.segments) {
    const start = off
    off += s.surface.length
    const probes: [string, string][] = []
    const flat = unvoiceAll(s.surface)
    if (flat !== s.surface) probes.push(['청탁만 다름', it.reading.slice(0, start) + flat + it.reading.slice(off)])
    const up = VOICE[s.surface[0]]
    if (up && start > 0) {
      probes.push(['청탁만 다름', it.reading.slice(0, start) + up + it.reading.slice(start + 1)])
    }
    // **진짜 간섭 오답** — 한국음이 같은 *다른* 한자의 음독을 끌어온다 (認識 → にんしょく).
    // 청탁 변화만 만들면 청탁만 나온다. 축 A 에서 한쪽 방향만 재고 틀렸던 것과 같은 함정이다
    for (const sib of siblingReadings(s.kanji)) {
      probes.push(['형제 한자 음독을 끌어옴', it.reading.slice(0, start) + sib + it.reading.slice(off)])
    }
    for (const [why, answer] of probes) {
      if (answer === it.reading) continue
      const v = explainMistake({ headword: it.headword, expected: it.reading, answer }, ctx)
      bump(`${why} → ${v.type ?? '분류 안 됨'}`, `${it.headword} ${it.reading} ← ${answer} (${s.kanji} ${kanjiRaw[s.kanji]?.kr.join('·')})`)
    }
  }
}

console.log('\n## 오답의 실제 내용 → 분류기가 내린 유형')
for (const [k, n] of [...kind].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(6)}  ${k}`)
  console.log('          ' + (samples.get(k) ?? []).slice(0, 5).join('\n          '))
}
