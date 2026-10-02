// 형제 항목 조립 검증 — id 규칙, 밴드, 분해, 채점만으로 내려가는 경우
import { describe, expect, it } from 'vitest'
import type { KanjiReadings } from '../../src/lib/onyomi.ts'
import type { Extras } from '../build-extra-readings.ts'
import { buildSiblings, siblingId, type ParentInfo } from './siblings.ts'

describe('siblingId', () => {
  it('JMdict id 에 읽기의 로마자를 붙인다', () => {
    expect(siblingId('1693370', 'ぎゃくて')).toBe('1693370-gyakute')
  })

  it('JMdict id 는 숫자뿐이라 `-` 가 든 id 와 부딪히지 않는다', () => {
    expect(siblingId('1', 'あ')).toContain('-')
    expect(/^\d+$/.test(siblingId('1', 'あ'))).toBe(false)
  })

  it('ASCII 만 쓴다 — 가나의 NFC/NFD 차이로 같은 id 가 둘이 되지 않는다', () => {
    const id = siblingId('42', 'ぎゅうにゅう')
    expect(/^[0-9a-z-]+$/.test(id)).toBe(true)
    // 탁음을 결합형으로 풀어 쓴 같은 읽기도 같은 id 가 된다
    expect(siblingId('42', 'ぎゅうにゅう'.normalize('NFD'))).toBe(id)
  })

  it('`ん` 뒤에 모음이 오는 읽기는 아포스트로피가 `-` 가 되어 구분된다 (かんい ≠ かに)', () => {
    expect(siblingId('7', 'かんい')).not.toBe(siblingId('7', 'かに'))
  })
})

// 逆 (ぎゃく) · 手 (て·しゅ) · 明 (めい·あか…) 정도만 있는 가짜 한자 표
const KANJI: Record<string, KanjiReadings> = {
  逆: { onyomi: ['ギャク'], kunyomi: ['さか', 'さからう'] },
  手: { onyomi: ['シュ'], kunyomi: ['て', 'た'] },
  明: { onyomi: ['メイ', 'ミョウ'], kunyomi: ['あか', 'あきらか'] },
}
const lookup = (k: string) => KANJI[k]

const sakate: ParentInfo = { id: '1693370', headword: '逆手', reading: 'さかて', pos: ['n'] }
const splitFor = (reading: string, readingPriority: string[] = []): Extras['split'][number] => ({
  reading,
  readingPriority,
  senses: [['foul trick']],
  own: [0],
})

describe('buildSiblings', () => {
  it('뜻이 갈린 읽기를 별도 항목으로 올린다 — id·분해·밴드', () => {
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくて', ['nf30'])] } },
      lookup,
      {},
      new Set(),
    )
    expect(r.siblings).toHaveLength(1)
    const s = r.siblings[0]!
    expect(s.id).toBe('1693370-gyakute')
    expect(s.parentId).toBe('1693370')
    expect(s.headword).toBe('逆手')
    expect(s.reading).toBe('ぎゃくて')
    // nf30 은 밴드 3 이다 — 기존 항목과 같은 계산(bandOf)이다
    expect(s.band).toBe(3)
    expect(s.common).toBe(true)
    // 逆(ぎゃく, 음) + 手(て, 훈) → 섞인 읽기
    expect(s.readingKind).toBe('mix')
    expect(s.pairIds).toHaveLength(2)
    expect(r.pairs.size).toBe(2)
  })

  it('우선순위 표시가 없으면 밴드 4 이고 common 이 아니다', () => {
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくて', [])] } },
      lookup,
      {},
      new Set(),
    )
    expect(r.siblings[0]!.band).toBe(4)
    expect(r.siblings[0]!.common).toBe(false)
  })

  it('이미 따로 항목이 있는 말은 만들지 않는다 (一目 いちもく 류)', () => {
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくて')] } },
      lookup,
      {},
      new Set(['逆手 ぎゃくて']),
    )
    expect(r.siblings).toEqual([])
    expect(r.demotedByParent.get('1693370')).toEqual(['ぎゃくて'])
  })

  it('음독 분해가 안 되는 읽기는 항목이 못 되고 채점만으로 내려간다', () => {
    // 手 의 읽기에 「だれ」 가 없다 → 분해 실패
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくだれ')] } },
      lookup,
      {},
      new Set(),
    )
    expect(r.siblings).toEqual([])
    expect(r.demoted[0]!.reason).toMatch(/분해 실패/)
    expect(r.demotedByParent.get('1693370')).toEqual(['ぎゃくだれ'])
  })

  it('사람이 만든 뜻이 있으면 그대로 싣는다', () => {
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくて')] } },
      lookup,
      { '1693370-gyakute': { definition: '반칙 수', source: 'llm', verified: false } },
      new Set(),
    )
    expect(r.siblings[0]!.koMeaning).toEqual({ definition: '반칙 수', source: 'llm', verified: false })
  })

  it('뜻이 없으면 null 이다 — 로더가 뜻 카드를 안 낸다', () => {
    const r = buildSiblings(
      [sakate],
      { '1693370': { plain: [], split: [splitFor('ぎゃくて')] } },
      lookup,
      {},
      new Set(),
    )
    expect(r.siblings[0]!.koMeaning).toBeNull()
  })

  it('split 이 없는 부모는 건드리지 않는다', () => {
    const r = buildSiblings([sakate], { '1693370': { plain: ['さかしゅ'], split: [] } }, lookup, {}, new Set())
    expect(r.siblings).toEqual([])
    expect(r.demoted).toEqual([])
  })

  it('id 가 겹치면 빌드를 멈춘다 — 조용히 덮어쓰면 기록이 엉뚱한 읽기에 붙는다', () => {
    // 같은 로마자가 되는 두 읽기 (장음 표기 차이)
    expect(() =>
      buildSiblings(
        [{ id: '9', headword: '明', reading: 'めい', pos: [] }],
        { '9': { plain: [], split: [splitFor('みょう'), splitFor('みょう')] } },
        lookup,
        {},
        new Set(),
      ),
    ).toThrow(/겹친다/)
  })
})
