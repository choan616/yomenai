// import-jmdict 산출물 검증 — 원본 XML에서 표본 20개의 entry만 다시 파싱해 읽기·품사·구성 한자가 일치하는지 확인
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { describe, it, expect, beforeAll } from 'vitest'
import { XMLParser } from 'fast-xml-parser'
import { DICT_DIR, findRawFile, componentKanji, type IdiomRecord } from './lib/dict.ts'

// 결정적 샘플링용 시드 PRNG (mulberry32)
function seeded(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface RawEntry {
  kebs: string[]
  rebs: string[]
  posCodes: Set<string>
}

const parser = new XMLParser({
  ignoreAttributes: false,
  isArray: (n) => ['k_ele', 'r_ele', 'sense', 'pos', 'keb', 'reb'].includes(n),
})
const t = (v: unknown) => (typeof v === 'string' ? v : String(v))

// 원본 XML 문자열에서 특정 ent_seq 의 <entry> 블록만 잘라 파싱
function parseRawEntry(xml: string, id: string): RawEntry | null {
  const marker = `<ent_seq>${id}</ent_seq>`
  const at = xml.indexOf(marker)
  if (at === -1) return null
  const start = xml.lastIndexOf('<entry>', at)
  const end = xml.indexOf('</entry>', at)
  if (start === -1 || end === -1) return null
  const frag = xml.slice(start, end + '</entry>'.length)
  const e = (parser.parse(frag) as { entry: Record<string, unknown> }).entry
  const kEles = (e.k_ele as Record<string, unknown>[] | undefined) ?? []
  const rEles = (e.r_ele as Record<string, unknown>[] | undefined) ?? []
  const senses = (e.sense as Record<string, unknown>[] | undefined) ?? []
  return {
    kebs: kEles.flatMap((k) => ((k.keb as string[] | undefined) ?? []).map(t)),
    rebs: rEles.flatMap((r) => ((r.reb as string[] | undefined) ?? []).map(t)),
    posCodes: new Set(
      senses.flatMap((s) => ((s.pos as string[] | undefined) ?? []).map((p) => t(p).replace(/[^A-Za-z0-9-]/g, ''))),
    ),
  }
}

describe('import-jmdict 산출물 vs 원본 XML (표본 20)', () => {
  let sample: IdiomRecord[]
  let raw: Map<string, RawEntry>

  beforeAll(() => {
    const idioms = (
      JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as { idioms: IdiomRecord[] }
    ).idioms

    const rng = seeded(20260903)
    const pool = [...idioms]
    sample = []
    for (let i = 0; i < 20; i++) sample.push(pool.splice(Math.floor(rng() * pool.length), 1)[0])

    const xml = gunzipSync(readFileSync(findRawFile('JMdict_e', '.gz'))).toString('utf8')
    raw = new Map()
    for (const s of sample) {
      const r = parseRawEntry(xml, s.id)
      if (r) raw.set(s.id, r)
    }
  })

  it('표본 20개가 모두 원본에서 조회된다', () => {
    expect(sample).toHaveLength(20)
    for (const s of sample) expect(raw.has(s.id), `id ${s.id} (${s.headword})`).toBe(true)
  })

  it('표제어가 원본 keb에 있다', () => {
    for (const s of sample) expect(raw.get(s.id)!.kebs, `${s.id} ${s.headword}`).toContain(s.headword)
  })

  it('읽기가 원본 reb에 있다', () => {
    for (const s of sample)
      expect(raw.get(s.id)!.rebs, `${s.id} ${s.headword} → ${s.reading}`).toContain(s.reading)
  })

  it('품사 코드가 모두 원본 pos에서 유래한다', () => {
    for (const s of sample) {
      const rc = raw.get(s.id)!.posCodes
      for (const p of s.pos)
        expect(rc.has(p), `${s.id} ${s.headword}: pos "${p}" 원본에 없음 [${[...rc]}]`).toBe(true)
    }
  })

  it('구성 한자와 글자수가 표제어와 일치한다', () => {
    for (const s of sample) {
      expect(componentKanji(s.headword).join('')).toBe(
        [...s.headword].filter((c) => c !== '々').join(''),
      )
      expect([...s.headword].length).toBe(s.length)
    }
  })

  it('표본 내용을 로그로 남긴다', () => {
    for (const s of sample) {
      console.log(
        `${s.id}\t${s.headword}\t${s.reading}\t[${s.pos.join(',')}]\t{${s.priority.join(',') || '-'}}`,
      )
    }
    expect(sample.every((s) => s.reading.length > 0 && s.pos.length > 0)).toBe(true)
  })
})
