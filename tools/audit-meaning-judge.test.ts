// 오탐률 관문의 순수 함수 단위 테스트 — 프롬프트에 정답이 새지 않는지, 응답 파싱이 판정과 실패를 가르는지
import { describe, expect, it } from 'vitest'
import { buildPrompt, collectJudged, parseVerdict, type JudgeRow } from './audit-meaning-judge.ts'

const row: JudgeRow = {
  id: '1',
  headword: '結構',
  reading: 'けっこう',
  glossEn: 'splendid; nice',
  koMeaning: '괜찮음',
  verdict: 'o',
  file: 'x.tsv',
}

describe('buildPrompt', () => {
  it('표제어·읽기·영어 뜻·한국어 뜻을 다 넣는다', () => {
    const p = buildPrompt(row)
    for (const s of ['結構', 'けっこう', 'splendid; nice', '괜찮음']) expect(p).toContain(s)
  })

  it('사람 판정을 프롬프트에 넣지 않는다 — 정답이 새면 관문이 아니다', () => {
    expect(buildPrompt(row)).not.toContain('사람 판정')
    expect(buildPrompt({ ...row, verdict: 'o' })).toBe(buildPrompt({ ...row, verdict: 's' }))
  })
})

describe('parseVerdict', () => {
  it('ok 를 그대로 읽는다', () => {
    expect(parseVerdict('{"ok": true, "reason": "맞다"}')).toEqual({ ok: true, reason: '맞다' })
    expect(parseVerdict('{"ok": false, "reason": "틀리다"}')).toEqual({ ok: false, reason: '틀리다' })
  })

  it('JSON 이 아니면 null — 파싱 실패를 「틀렸다」로 세지 않는다', () => {
    expect(parseVerdict('그건 좀')).toBeNull()
  })

  it('ok 가 boolean 이 아니면 null', () => {
    expect(parseVerdict('{"ok": "yes"}')).toBeNull()
    expect(parseVerdict('{"reason": "근거만 있음"}')).toBeNull()
  })

  it('reason 이 없어도 판정은 살린다', () => {
    expect(parseVerdict('{"ok": true}')).toEqual({ ok: true, reason: '' })
  })
})

describe('collectJudged', () => {
  const header = ['verdict', 'headword', 'reading', 'glossEn', 'llm_ko', 'stdict_def', 'id']
  const grid = [
    header,
    ['o', '結構', 'けっこう', 'splendid', '괜찮음', '결구 정의', '1'],
    ['s', '工夫', 'くふう', 'device', '궁리', '공부: 사전 정의', '2'],
    ['?', '未判', 'みはん', 'x', '미판정', '', '3'],
    ['', '빈칸', '', 'x', '빈칸', '', '4'],
  ]

  it('판정이 붙은 행만 모은다', () => {
    const got = collectJudged([{ name: 'a.tsv', grid }])
    expect(got.map((r) => r.headword)).toEqual(['結構', '工夫'])
  })

  it('s 판정은 사람이 고른 stdict 정의를 대상으로 삼는다', () => {
    const got = collectJudged([{ name: 'a.tsv', grid }])
    expect(got[1].koMeaning).toBe('공부: 사전 정의')
  })
})
