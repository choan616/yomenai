// 읽기 규칙 본문 검증 — 절 구조와 **예시가 코퍼스에 실재하는지**.
// 없는 숙어·없는 읽기를 싣지 않는 것이 이 테스트의 목적이다 (checklist 2026-09-17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MistakeType } from '../core/types.ts'
import {
  RULE_OF_MISTAKE,
  RULE_SECTIONS,
  ruleForMistake,
  ruleSection,
  SHORT_RULE,
  type RuleExample,
} from './rules.ts'

/** 배포되는 사전 번들 그대로 읽는다 — 화면이 보는 것과 같은 코퍼스여야 한다 */
const corpus: ReadonlySet<string> = (() => {
  const raw = readFileSync(resolve(process.cwd(), 'public/dict/base.json'), 'utf8')
  const { idioms } = JSON.parse(raw) as { idioms: { headword: string; reading: string }[] }
  return new Set(idioms.map((r) => `${r.headword}|${r.reading}`))
})()

function allExamples(): { where: string; ex: RuleExample }[] {
  const out: { where: string; ex: RuleExample }[] = []
  for (const s of RULE_SECTIONS) {
    for (const ex of s.examples) out.push({ where: `${s.id} examples`, ex })
    for (const c of s.contrasts) {
      out.push({ where: `${s.id} contrast.applied`, ex: c.applied })
      out.push({ where: `${s.id} contrast.blocked`, ex: c.blocked })
    }
  }
  return out
}

describe('rules 본문', () => {
  it('절 id 가 유일하다', () => {
    const ids = RULE_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('절마다 제목·요약·본문·예시가 있다', () => {
    for (const s of RULE_SECTIONS) {
      expect(s.title.length, s.id).toBeGreaterThan(0)
      expect(s.summary.length, s.id).toBeGreaterThan(0)
      expect(s.body.length, s.id).toBeGreaterThan(0)
      expect(s.examples.length, s.id).toBeGreaterThan(0)
      for (const p of s.body) expect(p.trim(), s.id).not.toBe('')
    }
  })

  it('예시마다 무엇을 보여주는지 한 줄이 붙어 있다', () => {
    for (const { where, ex } of allExamples()) expect(ex.note.trim(), `${where} ${ex.word}`).not.toBe('')
  })

  it('코퍼스 안 예시는 표기와 읽기가 실제로 존재한다', () => {
    const missing = allExamples()
      .filter(({ ex }) => !ex.outside)
      .filter(({ ex }) => !corpus.has(`${ex.word}|${ex.reading}`))
      .map(({ where, ex }) => `${where}: ${ex.word} ${ex.reading}`)
    expect(missing).toEqual([])
  })

  it('코퍼스 밖 예시는 정말로 코퍼스에 없다', () => {
    // outside 표시가 낡아서 남아 있으면 "없다" 는 설명이 거짓말이 된다
    const stale = allExamples()
      .filter(({ ex }) => ex.outside)
      .filter(({ ex }) => corpus.has(`${ex.word}|${ex.reading}`))
      .map(({ where, ex }) => `${where}: ${ex.word} ${ex.reading}`)
    expect(stale).toEqual([])
  })

  it('오답 유형 매핑이 실재하는 절을 가리킨다', () => {
    for (const [type, id] of Object.entries(RULE_OF_MISTAKE) as [MistakeType, string | null][]) {
      if (id === null) continue
      expect(ruleSection(id as never), `${type} → ${id}`).toBeDefined()
    }
  })

  it('매핑이 가리키는 절은 그 유형을 자기 유형으로 들고 있다', () => {
    for (const [type, id] of Object.entries(RULE_OF_MISTAKE) as [MistakeType, string | null][]) {
      if (id === null) continue
      expect(ruleSection(id as never)?.mistakes, `${type} → ${id}`).toContain(type)
    }
  })

  it('OKURIGANA 는 절을 갖지 않는다 (코퍼스가 한자 전용, PLAN §6)', () => {
    expect(RULE_OF_MISTAKE.OKURIGANA).toBeNull()
  })

  it('한국음 대응 절이 맨 앞이다 — 나머지 규칙이 여기서 갈린다', () => {
    expect(RULE_SECTIONS[0].id).toBe('korean-coda')
  })
})

describe('ruleForMistake — 갈래까지 보고 절을 고른다', () => {
  it('탁음 셋이 각자의 절로 간다', () => {
    expect(ruleForMistake('RENDAKU', 'rendaku')).toBe('rendaku')
    expect(ruleForMistake('RENDAKU', 'handaku')).toBe('handakuon')
    expect(ruleForMistake('RENDAKU', 'renjo')).toBe('renjo')
  })

  it('갈래를 모르면 대표 절(연탁)로 간다 — 어디에도 안 보내는 것보다 낫다', () => {
    expect(ruleForMistake('RENDAKU', null)).toBe('rendaku')
    expect(ruleForMistake('RENDAKU')).toBe('rendaku')
  })

  it('탁음이 아닌 유형은 갈래와 무관하다', () => {
    expect(ruleForMistake('SOKUON', 'handaku')).toBe('sokuon')
    expect(ruleForMistake('KO_INTERFERENCE', null)).toBe('korean-coda')
    expect(ruleForMistake('OKURIGANA', null)).toBeNull()
    expect(ruleForMistake(null, null)).toBeNull()
  })

  it('갈래가 붙은 절은 셋뿐이고 서로 다르다 — 한 갈래가 두 절로 가면 기록이 겹친다', () => {
    const tagged = RULE_SECTIONS.filter((s) => s.voicing !== undefined)
    expect(tagged).toHaveLength(3)
    expect(new Set(tagged.map((s) => s.voicing)).size).toBe(3)
    for (const s of tagged) expect(s.mistakes).toEqual(['RENDAKU'])
  })
})

/**
 * 반탁은 **안 걸리는 쪽**을 같이 가르쳐야 한다 (사용자 지적 2026-09-17).
 *
 * 분류기는 규칙을 덜 쓴 오답(出発 → しゅっはつ)과 과하게 쓴 오답(心不全 → しんぷぜん)을
 * 같은 「반탁」으로 묶는다. 절이 거는 법만 가르치면 후자에게 틀린 것을 가르친다.
 * 카드 옆에서는 요약본만 펴지므로 그 경계가 `SHORT_RULE` 안에 들어와 있어야 한다.
 */
describe('반탁 절의 과잉 적용 경계', () => {
  const handaku = ruleSection('handakuon')!

  it('같은 ん + ふ 환경에서 갈리는 최소 대립쌍이 있다', () => {
    const pair = handaku.contrasts.find((c) => c.blocked.word === '心不全')
    expect(pair?.applied.word).toBe('満腹')
  })

  it('그 경계가 카드 옆 요약본까지 닿는다', () => {
    const shown = [
      ...handaku.body.slice(0, SHORT_RULE.body),
      ...handaku.contrasts.slice(0, SHORT_RULE.contrasts).map((c) => c.blocked.word + c.because),
    ].join(' ')
    expect(shown).toContain('心不全')
  })
})
