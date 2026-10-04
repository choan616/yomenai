// 한자 끝말잇기 규칙 검증 — 끝 한자(々), 읽기 판정, 앱의 답, 실제 사전에서의 무작위 대국
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildIndex,
  continuations,
  hintWords,
  judge,
  normReading,
  pickReply,
  startWord,
  tailKanji,
  type Word,
} from './shiritori.ts'

const w = (id: string, headword: string, reading: string, band = 0): Word => ({ id, headword, reading, band })

describe('tailKanji', () => {
  it('마지막 한자', () => {
    expect(tailKanji('学校')).toBe('校')
  })
  it('々 는 앞 글자를 되풀이하므로 앞 글자가 끝 한자다', () => {
    expect(tailKanji('時々')).toBe('時')
    expect(tailKanji('人々々')).toBe('人')
  })
})

describe('normReading', () => {
  it('가타카나로 쳐도 같은 읽기', () => {
    expect(normReading('ガッコウ')).toBe('がっこう')
    expect(normReading(' がっこう ')).toBe('がっこう')
  })
})

const WORDS = [
  w('1', '学校', 'がっこう'),
  w('2', '校長', 'こうちょう'),
  w('3', '校庭', 'こうてい'),
  w('4', '長期', 'ちょうき'),
  w('5', '長所', 'ちょうしょ', 2),
  w('6', '期待', 'きたい'),
  w('7', '校歌', 'こうか'),
  w('8', '人気', 'にんき'),
  w('9', '人気', 'ひとけ', 3),
]
const index = buildIndex(WORDS)

describe('judge', () => {
  it('그 한자로 시작하는 말의 읽기와 맞으면 그 말이 된다', () => {
    expect(judge(index, '校', 'こうちょう', new Set())).toEqual({ kind: 'ok', word: WORDS[1] })
  })
  it('그 한자로 시작하지만 읽기가 다르면 없는 말이다', () => {
    expect(judge(index, '校', 'ちょうき', new Set())).toEqual({ kind: 'none' })
    expect(judge(index, '校', '', new Set())).toEqual({ kind: 'none' })
  })
  it('같은 표기의 다른 읽기(altReadings)도 받는다', () => {
    const idx = buildIndex([{ id: 'x', headword: '今日', reading: 'きょう', altReadings: ['こんにち'], band: 0 }])
    expect(judge(idx, '今', 'こんにち', new Set()).kind).toBe('ok')
  })
  it('이미 쓴 말은 used', () => {
    expect(judge(index, '校', 'こうちょう', new Set(['校長'])).kind).toBe('used')
  })
  it('표기가 같은 말은 읽기로 가른다 (人気: にんき / ひとけ)', () => {
    expect(judge(index, '人', 'ひとけ', new Set())).toEqual({ kind: 'ok', word: WORDS[8] })
    // 한 표기를 쓰면 다른 읽기도 쓴 말로 센다
    expect(judge(index, '人', 'ひとけ', new Set(['人気'])).kind).toBe('used')
  })
})

describe('continuations·pickReply·hintWords', () => {
  it('끝 한자로 시작하는, 안 쓴 말', () => {
    expect(continuations(index, WORDS[0]!, new Set(['学校'])).map((x) => x.headword)).toEqual(['校長', '校庭', '校歌'])
    expect(continuations(index, WORDS[0]!, new Set(['学校', '校長'])).map((x) => x.headword)).toEqual(['校庭', '校歌'])
  })
  it('이을 말이 없으면 null (플레이어 승)', () => {
    // 期待 → 待 로 시작하는 말이 없다
    expect(pickReply(index, WORDS[5]!, new Set(['期待']))).toBeNull()
  })
  it('앱의 답은 사슬을 이으며 이미 쓴 말을 내지 않는다', () => {
    for (let i = 0; i < 50; i++) {
      const r = pickReply(index, WORDS[0]!, new Set(['学校', '校長']))!
      expect(['校庭', '校歌']).toContain(r.headword)
    }
  })
  it('가능하면 이어 갈 길이 남은 말을 고른다 (rng 0 → 항상 그 쪽)', () => {
    // 校長(→長期·長所 로 이어짐)·校庭(→庭 없음)·校歌(→歌 없음): 살아 있는 건 校長 뿐
    expect(pickReply(index, WORDS[0]!, new Set(['学校']), () => 0)!.headword).toBe('校長')
  })
  it('힌트는 표기만 — 안 쓴 말을 흔한 순으로', () => {
    const h = hintWords(index, '長', new Set(), 5)
    expect(h.map((x) => x.headword)).toEqual(['長期', '長所'])
    expect(hintWords(index, '長', new Set(['長期']), 5).map((x) => x.headword)).toEqual(['長所'])
  })
})

describe('실제 사전', () => {
  const base = (JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: Word[] }).idioms
  const real = buildIndex(base)

  it('첫 말은 이을 말이 넉넉하다', () => {
    for (let i = 0; i < 20; i++) {
      const s = startWord(real)
      expect(continuations(real, s, new Set([s.headword])).length).toBeGreaterThanOrEqual(5)
    }
  })

  it('무작위 대국 300판이 규칙을 어기지 않고 끝난다', () => {
    let seed = 7
    const rng = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296)
    for (let g = 0; g < 300; g++) {
      const used = new Set<string>()
      let cur = startWord(real, rng)
      used.add(cur.headword)
      for (let turn = 0; turn < 200; turn++) {
        // 플레이어: 이을 말 중 하나를 읽기로 낸다
        const options = continuations(real, cur, used)
        if (options.length === 0) break
        const pick = options[Math.floor(rng() * options.length)]!
        const v = judge(real, tailKanji(cur.headword), pick.reading, used)
        expect(v.kind).toBe('ok')
        const mine = (v as { word: Word }).word
        expect(tailKanji(cur.headword)).toBe(mine.headword[0])
        used.add(mine.headword)
        const reply = pickReply(real, mine, used, rng)
        if (!reply) break
        expect(reply.headword[0]).toBe(tailKanji(mine.headword))
        expect(used.has(reply.headword)).toBe(false)
        used.add(reply.headword)
        cur = reply
      }
    }
  })
})
