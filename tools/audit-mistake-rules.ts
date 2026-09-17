// 오답 유형 분류가 「그 규칙이 실제로 걸린 자리」에만 붙는지 전수로 대조하는 감사 스크립트.
//
// 2026-09-17 연탁 건(月額 げつがく ← げつかく 가 연탁으로 갔다)이 드러낸 실패 모양을
// 다른 축으로 넓힌 것이다 — 분류기가 **정답 쪽 분해를 안 보고** 문자열 관계만으로 유형을
// 붙이면, 규칙이 걸릴 자리가 아닌 곳에 규칙을 가르친다.
//
// 코퍼스의 각 숙어에서 조각 하나를 축별로 흔들어 오답을 합성하고, 그 축의 변형이 정답에
// 실제로 걸려 있었는지와 분류 결과를 대조한다. 판단은 사람이 한다 — 이 스크립트는 후보만 낸다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decompose, type KanjiReadings, type Segment } from '../src/lib/onyomi.ts'
import { stripLongVowels, unvoiceAll } from '../src/lib/readings.ts'
import { buildKoSiblingIndex, explainMistake, type MistakeContext } from '../src/core/mistakes.ts'
import type { MistakeType } from '../src/core/types.ts'

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

const VOICING = ['rendaku', 'renjo', 'handaku'] as const
const hasVoicing = (s: Segment) => s.variants.some((v) => (VOICING as readonly string[]).includes(v))
const hasSokuon = (s: Segment) => s.variants.includes('sokuon')

const VOICE: Record<string, string> = {}
for (const [a, b] of [['か','が'],['き','ぎ'],['く','ぐ'],['け','げ'],['こ','ご'],['さ','ざ'],
  ['し','じ'],['す','ず'],['せ','ぜ'],['そ','ぞ'],['た','だ'],['ち','ぢ'],['つ','づ'],['て','で'],
  ['と','ど'],['は','ば'],['ひ','び'],['ふ','ぶ'],['へ','べ'],['ほ','ぼ']]) VOICE[a] = b

/** 한 축을 흔들어 만든 오답 하나 */
interface Probe {
  /** 흔든 축 */
  family: string
  /** 그 축의 변형이 **정답에 실제로 걸려 있었나** */
  applied: boolean
  answer: string
}

function probes(reading: string, segs: Segment[]): Probe[] {
  const out: Probe[] = []
  let off = 0
  for (const s of segs) {
    const start = off
    off += s.surface.length
    const swap = (text: string, from = start, to = off) =>
      reading.slice(0, from) + text + reading.slice(to)

    // 탁음 — 뺀 답과 덧댄 답
    const flat = unvoiceAll(s.surface)
    if (flat !== s.surface && !hasSokuon(s)) {
      out.push({ family: '탁음 뺌', applied: hasVoicing(s), answer: swap(flat) })
    }
    const up = VOICE[s.surface[0]]
    if (up && start > 0) {
      out.push({ family: '탁음 덧댐', applied: false, answer: swap(up, start, start + 1) })
    }

    // 촉음 — 뺀 답과 덧댄 답
    // 축을 하나만 흔든다 — base 로 되돌리면 연탁까지 같이 벗겨지는 조각(切 ぎっ → きり)은 뺀다
    if (s.variants.length === 1 && hasSokuon(s) && s.surface.endsWith('っ')) {
      out.push({ family: '촉음 뺌', applied: true, answer: swap(s.base) })
    }
    if (!hasSokuon(s) && /[つちくき]$/.test(s.surface) && off < reading.length) {
      out.push({ family: '촉음 덧댐', applied: false, answer: swap(s.surface.slice(0, -1) + 'っ') })
    }

    // 장음 — 흘린 답
    const short = stripLongVowels(s.surface)
    if (short !== s.surface) out.push({ family: '장음 흘림', applied: true, answer: swap(short) })
  }
  return out.filter((p) => p.answer !== reading)
}

const table = new Map<string, Map<string, number>>()
const samples = new Map<string, string[]>()
const bump = (family: string, key: string) => {
  let row = table.get(family)
  if (row === undefined) table.set(family, (row = new Map()))
  row.set(key, (row.get(key) ?? 0) + 1)
}

for (const it of idioms) {
  const d = decompose(it.headword, it.reading, lookup)
  if (!d.ok) continue
  for (const p of probes(it.reading, d.segments)) {
    const { type } = explainMistake(
      { headword: it.headword, expected: it.reading, answer: p.answer },
      ctx,
    )
    bump(p.family, `${p.applied ? '걸린 자리' : '안 걸린 자리'} → ${type ?? '분류 안 됨'}`)
    // 규칙이 안 걸린 자리인데 그 규칙 유형이 나오면 후보다 (月額 모양)
    const suspect: Partial<Record<string, MistakeType>> = {
      '탁음 뺌': 'RENDAKU',
      '촉음 뺌': 'SOKUON',
      '장음 흘림': 'CHOON',
    }
    const mismatch = p.applied && suspect[p.family] !== undefined && suspect[p.family] !== type
    if (mismatch || (!p.applied && suspect[p.family] === type)) {
      const key = `${p.family}|${p.applied ? '걸림' : '안걸림'}|${type}`
      const list = samples.get(key) ?? []
      if (list.length < 10) list.push(`${it.headword} ${it.reading} ← ${p.answer}`)
      samples.set(key, list)
    }
  }
}

for (const [family, row] of [...table].sort()) {
  console.log(`\n## ${family}`)
  for (const [k, n] of [...row].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(6)}  ${k}`)
}
if (samples.size > 0) {
  console.log('\n## 규칙이 안 걸린 자리인데 그 규칙으로 간 표본')
  for (const [k, list] of samples) console.log(`  ${k}\n    ${list.join('\n    ')}`)
}
