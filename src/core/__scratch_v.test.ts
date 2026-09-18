import { describe, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { decompose } from '../lib/onyomi.ts'
import { unvoiceAll } from '../lib/readings.ts'
import { buildKoSiblingIndex, explainMistake, type MistakeContext } from './mistakes.ts'
const raw = JSON.parse(readFileSync('public/dict/kanji.json', 'utf8')).kanji
const lookup = (k: string) => { const r = raw[k]; return r ? { onyomi: r.on, kunyomi: r.kun } : undefined }
const idx: Record<string, any> = {}
for (const [k, v] of Object.entries<any>(raw)) idx[k] = { koreanH: v.kr, onyomi: v.on }
const ctx: MistakeContext = { lookup, koSiblingOnyomi: buildKoSiblingIndex(idx) }
const base = JSON.parse(readFileSync('public/dict/base.json', 'utf8'))
const VOICED = ['rendaku', 'renjo', 'handaku']
const VOICE: Record<string, string> = {}
for (const [a, b] of [['か','が'],['き','ぎ'],['く','ぐ'],['け','げ'],['こ','ご'],['さ','ざ'],
  ['し','じ'],['す','ず'],['せ','ぜ'],['そ','ぞ'],['た','だ'],['ち','ぢ'],['つ','づ'],['て','で'],
  ['と','ど'],['は','ば'],['ひ','び'],['ふ','ぶ'],['へ','べ'],['ほ','ぼ'],['ぱ','ば'],['ぴ','び'],
  ['ぷ','ぶ'],['ぺ','べ'],['ぽ','ぼ']]) VOICE[a] = b

describe('v', () => {
  it('갈래가 정답 쪽 변형과 어긋나는 건수', () => {
    let bad = 0
    const words = new Set<string>()
    const samples: string[] = []
    for (const i of base.idioms) {
      const d = decompose(i.headword, i.reading, lookup)
      if (!d.ok) continue
      let off = 0
      for (const s of d.segments) {
        const start = off; off += s.surface.length
        const tries = [
          i.reading.slice(0, start) + unvoiceAll(s.surface) + i.reading.slice(off),
          VOICE[s.surface[0]] ? i.reading.slice(0, start) + VOICE[s.surface[0]] + i.reading.slice(start + 1) : '',
        ].filter((a) => a !== '' && a !== i.reading)
        const want = VOICED.find((x) => s.variants.includes(x))
        if (want === undefined) continue
        for (const answer of tries) {
          const v = explainMistake({ headword: i.headword, expected: i.reading, answer }, ctx)
          if (v.type !== 'RENDAKU' || v.voicing === null) continue
          if (v.voicing !== want) {
            bad++
            words.add(i.headword)
            if (samples.length < 6) samples.push(`${i.headword} ${i.reading} ← ${answer} : ${v.voicing} (정답은 ${want})`)
          }
        }
      }
    }
    console.log('어긋남', bad, '건 ·', words.size, '개 숙어')
    console.log(samples.join('\n'))
  })
})
