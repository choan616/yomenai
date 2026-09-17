// 읽기 규칙 본문 검증 — 절 구조와 **예시가 코퍼스에 실재하는지**.
// 없는 숙어·없는 읽기를 싣지 않는 것이 이 테스트의 목적이다 (checklist 2026-09-17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { MistakeType } from '../core/types.ts'
import { RULE_OF_MISTAKE, RULE_SECTIONS, ruleSection, type RuleExample } from './rules.ts'

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
