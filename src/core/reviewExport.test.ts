// 검수 판정 내보내기 — 나가는 것이 판정뿐인가, 다시 내보내도 같은 줄이 나오는가
import { describe, expect, it } from 'vitest'
import { buildReviewExport } from './reviewExport.ts'
import type { LearningEvent, MeaningVerdict } from './types.ts'

let seq = 0
const flag = (
  idiomId: string,
  headword: string,
  verdict: MeaningVerdict | null,
  extra: { fix?: string; at?: number } = {},
): LearningEvent =>
  ({
    id: `e${String(seq++).padStart(4, '0')}`,
    userId: 'local',
    deviceId: 'dev-1',
    idiomId,
    type: 'flag',
    cardType: 'meaning',
    mistakeType: null,
    verdict,
    headword,
    definition: '화면에 떠 있던 뜻',
    at: extra.at ?? 1000 + seq,
    deletedAt: null,
    ...(extra.fix ? { fix: extra.fix } : {}),
  }) as LearningEvent

// 마지막 칸이 비면 줄이 탭으로 끝난다. 통째로 trim 하면 그 칸이 사라지므로 줄부터 가른다
const rows = (tsv: string) =>
  tsv.split('\n').filter((l) => l.length > 0).map((l) => l.split('\t'))

describe('판정 네 칸만 나간다', () => {
  it('머리줄은 id·headword·verdict·fix 뿐이다', () => {
    expect(rows(buildReviewExport([]))[0]).toEqual(['id', 'headword', 'verdict', 'fix'])
  })

  it('학습 기록이 될 만한 칸은 아예 안 실린다', () => {
    const tsv = buildReviewExport([flag('i1', '明白', 'ok')])
    // deviceId·at·definition 은 이벤트에 있지만 내보내기에는 자리가 없다
    expect(tsv).not.toContain('dev-1')
    expect(tsv).not.toContain('화면에 떠 있던 뜻')
    expect(rows(tsv)[1]).toEqual(['i1', '明白', 'o', ''])
  })
})

describe('검수 TSV 의 어휘로 옮긴다', () => {
  it('ok → o · bad+fix → x · bad → ~ · 취소 → -', () => {
    const tsv = buildReviewExport([
      flag('i1', '愛好', 'ok'),
      flag('i2', '明白', 'bad', { fix: '분명하다' }),
      flag('i3', '愛国', 'bad'),
      flag('i4', '悪化', null),
    ])
    const by = new Map(rows(tsv).slice(1).map((r) => [r[0], r]))
    expect(by.get('i1')).toEqual(['i1', '愛好', 'o', ''])
    expect(by.get('i2')).toEqual(['i2', '明白', 'x', '분명하다'])
    expect(by.get('i3')).toEqual(['i3', '愛国', '~', ''])
    // 취소도 싣는다 — 판정은 아니지만 사람이 본 줄이다
    expect(by.get('i4')).toEqual(['i4', '悪化', '-', ''])
  })
})

describe('마지막 판정이 이긴다', () => {
  it('되돌린 판정은 마지막 것만 나간다', () => {
    const tsv = buildReviewExport([
      flag('i1', '明白', 'bad', { fix: '틀린 고침', at: 100 }),
      flag('i1', '明白', 'ok', { at: 200 }),
    ])
    expect(rows(tsv).slice(1)).toEqual([['i1', '明白', 'o', '']])
  })

  it('입력 순서가 뒤집혀도 같다 — 기기별 파일을 합쳐도 흔들리면 안 된다', () => {
    const a = flag('i1', '明白', 'bad', { fix: '분명하다', at: 300 })
    const b = flag('i1', '明白', 'ok', { at: 100 })
    expect(buildReviewExport([a, b])).toBe(buildReviewExport([b, a]))
  })

  it('지운 이벤트는 안 본다', () => {
    const e = { ...flag('i1', '明白', 'ok'), deletedAt: 5 } as LearningEvent
    expect(rows(buildReviewExport([e])).length).toBe(1)
  })
})

describe('git diff 가 판정 변화만 보이게', () => {
  it('줄 순서는 표기순으로 고정된다', () => {
    const tsv = buildReviewExport([
      flag('i2', '明白', 'ok'),
      flag('i1', '愛好', 'ok'),
      flag('i3', '悪化', 'ok'),
    ])
    expect(rows(tsv).slice(1).map((r) => r[1])).toEqual(['愛好', '悪化', '明白'])
  })

  it('고친 뜻에 탭이나 줄바꿈이 섞여도 칸이 안 밀린다', () => {
    const tsv = buildReviewExport([flag('i1', '明白', 'bad', { fix: '분명\t하다\n또렷하다 ' })])
    expect(rows(tsv)[1]).toEqual(['i1', '明白', 'x', '분명 하다 또렷하다'])
  })
})

describe('옛 이벤트 호환', () => {
  it('verdict 없이 on:true 만 있던 첫 배포분도 읽는다', () => {
    const old = { ...flag('i1', '明白', null), on: true } as LearningEvent
    expect(rows(buildReviewExport([old]))[1]).toEqual(['i1', '明白', '~', ''])
  })
})
