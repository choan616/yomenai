// 넓힌 사전 항목을 학습 사전으로 들이기 — 무엇이 들어오고 무엇이 막히나
import { describe, expect, it } from 'vitest'
import { adopt, withWideKanji, type WideDict, type WideIdiom } from './wide.ts'
import type { KanjiInfo } from './load.ts'
import type { KanjiReadings } from '../lib/onyomi.ts'

const READINGS: Record<string, KanjiReadings> = {
  爆: { onyomi: ['バク'], kunyomi: ['は.ぜる'] },
  轟: { onyomi: ['ゴウ', 'コウ'], kunyomi: ['とどろ.く'] },
  躊: { onyomi: ['チュウ'], kunyomi: [] },
  躇: { onyomi: ['チョ'], kunyomi: [] },
  稲: { onyomi: ['トウ'], kunyomi: ['いね', 'いな'] },
  妻: { onyomi: ['サイ'], kunyomi: ['つま'] },
}
const lookup = (k: string): KanjiReadings | undefined => READINGS[k]

const wide = (headword: string, reading: string, extra: Partial<WideIdiom> = {}): WideIdiom => ({
  id: 'w1',
  headword,
  reading,
  pos: ['n'],
  glossEn: ['x'],
  ...extra,
})

describe('음독으로 갈라지면 들어온다', () => {
  it('爆轟 — 음독 쌍 둘이 붙는다', () => {
    const got = adopt(wide('爆轟', 'ばくごう'), lookup)
    expect(got?.pairIds).toEqual(['爆:on:ばく', '轟:on:ごう'])
    expect(got?.readingKind).toBe('on')
  })

  it('躊躇 — 상용 밖 글자만으로 된 것도 들어온다', () => {
    expect(adopt(wide('躊躇', 'ちゅうちょ'), lookup)?.pairIds).toEqual([
      '躊:on:ちゅう',
      '躇:on:ちょ',
    ])
  })

  it('**밴드 4 로 들어온다** — 빈도 순위가 없는 것이 사실이다', () => {
    expect(adopt(wide('爆轟', 'ばくごう'), lookup)?.band).toBe(4)
  })

  it('뜻이 없다고 표시한다 — assignMode 가 교정 모드로 고정한다', () => {
    const got = adopt(wide('爆轟', 'ばくごう'), lookup)
    expect(got?.hasMeaning).toBe(false)
    expect(got?.koMeaning).toBeNull()
  })

  it('다른 읽기도 같이 들고 온다 — 읽기 채점이 그것도 정답으로 받는다', () => {
    const got = adopt(wide('爆轟', 'ばくごう', { altReadings: ['ばくこう'] }), lookup)
    expect(got?.altReadings).toEqual(['ばくこう'])
  })
})

describe('못 가르면 안 들인다', () => {
  // 가르는 기준은 상용한자가 아니라 **읽기를 한자 단위로 가를 수 있느냐**다
  it('음독 조각이 하나도 없으면 막는다 — 음독 맵도 형제 대조도 안 붙는다', () => {
    expect(adopt(wide('稲妻', 'いなずま'), lookup)).toBeNull()
  })

  it('분해 자체가 안 되면 막는다', () => {
    expect(adopt(wide('爆轟', 'でたらめ'), lookup)).toBeNull()
  })

  it('한자 자료가 없으면 막는다 — 없는 글자를 아는 척하지 않는다', () => {
    expect(adopt(wide('邂逅', 'かいこう'), lookup)).toBeNull()
  })
})

describe('한자 자료 합치기', () => {
  const info = (kr: string): KanjiInfo => ({ kr: [kr], krOld: [], on: [], kun: [] })

  it('넓힌 사전 쪽 글자가 얹힌다 — 없으면 후리가나·오답 분류가 조용히 안 붙는다', () => {
    const base = new Map([['明', info('명')]])
    const dict = { kanji: new Map([['轟', info('굉')]]) } as WideDict
    const merged = withWideKanji(base, dict)
    expect(merged.get('轟')?.kr).toEqual(['굉'])
    expect(merged.get('明')?.kr).toEqual(['명'])
  })

  it('넓힌 사전이 없으면 원래 Map 을 그대로 준다 — 쓸데없이 복사하지 않는다', () => {
    const base = new Map([['明', info('명')]])
    expect(withWideKanji(base, null)).toBe(base)
  })
})
