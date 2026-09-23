// 카메라 인식 결과를 사전과 맞추는 로직 — 실제로 여기가 틀려서 엉뚱한 답이 나왔다
import { describe, expect, it } from 'vitest'
import { findInDict, hitSpan, nearMisses, normalize, pickBest, type DictHit } from './ocrMatch.ts'

const ENTRIES: DictHit[] = [
  { idiomId: '1', headword: '爆弾', reading: 'ばくだん' },
  { idiomId: '2', headword: '飲料', reading: 'いんりょう' },
  { idiomId: '3', headword: '和合', reading: 'わごう' },
  { idiomId: '4', headword: '自重', reading: 'じちょう' },
  { idiomId: '5', headword: '重労働', reading: 'じゅうろうどう' },
  { idiomId: '6', headword: '軍艦', reading: 'ぐんかん' },
  { idiomId: '7', headword: '軍隊', reading: 'ぐんたい' },
  { idiomId: '8', headword: '課徴金', reading: 'かちょうきん' },
]
const byHead = new Map(ENTRIES.map((e) => [e.headword, e]))
const lookup = (h: string) => byHead.get(h)

describe('normalize', () => {
  it('공백류를 턴다 — 터서랙트가 한자 사이에 잘 넣는다', () => {
    expect(normalize('爆 弾　は')).toBe('爆弾は')
  })
})

describe('findInDict', () => {
  it('앞뒤에 이웃 글자가 붙어도 안쪽 구간을 잡는다', () => {
    // 실측: 네모가 단어보다 조금 커서 조사·따옴표가 딸려 왔다
    expect(findInDict('『爆弾は知', lookup)?.headword).toBe('爆弾')
    expect(findInDict('4ら飲料缶の', lookup)?.headword).toBe('飲料')
  })

  it('긴 것부터 본다 — 짧은 것이 안에 들어 있어도 긴 쪽을 낸다', () => {
    expect(findInDict('ぜんぶ重労働だ', lookup)?.headword).toBe('重労働')
  })

  it('한 글자는 표제어로 안 본다', () => {
    expect(findInDict('爆', lookup)).toBeUndefined()
  })

  it('없으면 undefined', () => {
    expect(findInDict('ずぼぼぼ', lookup)).toBeUndefined()
  })
})

describe('pickBest', () => {
  it('**가장 긴 적중이 이긴다** — 꼬리에서 주운 두 글자가 답이 되면 안 된다', () => {
    // 실측 그대로. 첫 적중에서 멈추던 때 和合 이 답으로 나왔다
    const attempts = [
      { size: 56, text: '「それともクイズにしなかったのはたんなる手抜きとい党地和合和滞る' },
      { size: 44, text: 'ぜんぶ重労働だ' },
    ]
    expect(pickBest(attempts, lookup)?.hit?.headword).toBe('重労働')
  })

  it('같은 길이면 잡소리가 적은 쪽', () => {
    const attempts = [
      { size: 56, text: '4ら飲料缶のほかにもいろいろ' },
      { size: 44, text: '飲料缶' },
    ]
    expect(pickBest(attempts, lookup)?.attempt.size).toBe(44)
  })

  it('적중이 하나도 없으면 글자가 가장 많이 읽힌 것을 낸다 — 근사 매칭이 그걸 쓴다', () => {
    const attempts = [
      { size: 56, text: '' },
      { size: 44, text: '軍朋' },
      { size: 34, text: '軍' },
    ]
    const best = pickBest(attempts, lookup)
    expect(best?.hit).toBeUndefined()
    expect(best?.attempt.text).toBe('軍朋')
  })

  it('빈 목록이면 undefined', () => {
    expect(pickBest([], lookup)).toBeUndefined()
  })
})

describe('nearMisses', () => {
  it('한 자만 어긋난 표기를 후보로 낸다', () => {
    // 실측 오답 꼴 — 軍艦 을 軍朋 으로 읽었다
    expect(nearMisses('軍朋', byHead.keys())).toContain('軍艦')
  })

  it('길이가 다르면 안 본다', () => {
    expect(nearMisses('軍', byHead.keys())).toEqual([])
    expect(nearMisses('軍朋隊', byHead.keys())).toEqual([])
  })

  it('두 자 이상 어긋나면 안 낸다 — 넓히면 아무 말이나 나온다', () => {
    expect(nearMisses('朋朋', byHead.keys())).toEqual([])
  })

  it('정확히 같은 것은 후보가 아니다 (차이가 0이라 안 걸린다)', () => {
    expect(nearMisses('軍艦', byHead.keys())).not.toContain('軍艦')
  })

  it('상한을 지킨다', () => {
    expect(nearMisses('軍朋', ['軍艦', '軍隊', '軍旗', '軍歌'], 2)).toHaveLength(2)
  })
})

describe('hitSpan', () => {
  it('사전이 집어낸 구간의 위치를 준다 — 화면이 그 부분만 도드라지게 쓴다', () => {
    expect(hitSpan('4ら飲料缶の', '飲料')).toEqual({ before: '4ら', hit: '飲料', after: '缶の' })
  })

  it('앞뒤가 비어도 된다', () => {
    expect(hitSpan('爆弾', '爆弾')).toEqual({ before: '', hit: '爆弾', after: '' })
  })

  it('못 찾으면 전부 before 로 — 원문을 잃지 않는다', () => {
    expect(hitSpan('軍朋', '軍艦')).toEqual({ before: '軍朋', hit: '', after: '' })
  })
})
