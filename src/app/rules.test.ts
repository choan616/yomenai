// 읽기 규칙 본문 검증 — 절 구조와 **예시가 코퍼스에 실재하는지**.
// 없는 숙어·없는 읽기를 싣지 않는 것이 이 테스트의 목적이다 (checklist 2026-09-17).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { decompose } from '../lib/onyomi.ts'
import type { VariantKind } from '../lib/readings.ts'
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

/**
 * 예시가 **그 절의 규칙을 실제로 보여주는지** (2026-09-17, 문법 노출 점검 축 B).
 *
 * 코퍼스에 실재하는지는 위에서 봤다. 여기서는 한 걸음 더 간다 — 연탁 절의 예시는 분해에
 * `rendaku` 가 붙어 있어야 하고, 안 붙어 있으면 `offRule` 로 이유를 밝혀야 한다.
 * 이 검사가 없어서 **연성 절 예시 다섯 중 셋이 연성으로 분해되지 않는 채 실려 있었다**
 * (사전이 のう·のん·ねん 을 별도 읽기로 등재). 본문은 그 셋을 연성 예로 가르치는데 앱은
 * 음독 선택으로 분류해 다른 절로 보내고 있었다.
 */
describe('예시가 그 절의 규칙을 실제로 갖고 있다', () => {
  const kanji = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/dict/kanji.json'), 'utf8'),
  ).kanji as Record<string, { on: string[]; kun: string[] }>
  const lookup = (k: string) => {
    const r = kanji[k]
    return r === undefined ? undefined : { onyomi: r.on, kunyomi: r.kun }
  }

  /** 변형으로 판정되는 절만. 종성 대응·장음·음독 층위·혼독은 변형 태그가 없는 축이다 */
  const BY_VARIANT: Partial<Record<string, VariantKind>> = {
    sokuon: 'sokuon',
    handakuon: 'handaku',
    renjo: 'renjo',
    rendaku: 'rendaku',
  }

  const tagged = (ex: RuleExample, variant: VariantKind): boolean => {
    const d = decompose(ex.word, ex.reading, lookup)
    return d.ok && d.segments.some((s) => s.variants.includes(variant))
  }

  it('변형 절의 예시는 분해에 그 변형이 붙어 있다 — 아니면 offRule 로 밝힌다', () => {
    for (const s of RULE_SECTIONS) {
      const variant = BY_VARIANT[s.id]
      if (variant === undefined) continue
      for (const ex of s.examples) {
        if (ex.outside) continue
        const has = tagged(ex, variant)
        expect(has || ex.offRule !== undefined, `${s.id} · ${ex.word} ${ex.reading}`).toBe(true)
      }
    }
  })

  it('offRule 이 붙은 예시는 정말로 그 변형이 없다 — 표시가 낡으면 설명이 거짓이 된다', () => {
    for (const s of RULE_SECTIONS) {
      const variant = BY_VARIANT[s.id]
      if (variant === undefined) continue
      for (const ex of s.examples) {
        if (ex.offRule === undefined || ex.outside) continue
        expect(tagged(ex, variant), `${s.id} · ${ex.word} ${ex.reading}`).toBe(false)
      }
    }
  })

  it('대조쌍은 applied 에 변형이 있고 blocked 에는 없다', () => {
    for (const s of RULE_SECTIONS) {
      const variant = BY_VARIANT[s.id]
      if (variant === undefined) continue
      for (const c of s.contrasts) {
        expect(tagged(c.applied, variant), `${s.id} applied ${c.applied.word}`).toBe(true)
        expect(tagged(c.blocked, variant), `${s.id} blocked ${c.blocked.word}`).toBe(false)
      }
    }
  })

  it('앱이 그 절로 보내는 예시가 요약본 안에 하나는 있다 — 카드에서 잘리면 없는 것과 같다', () => {
    for (const s of RULE_SECTIONS) {
      const variant = BY_VARIANT[s.id]
      if (variant === undefined) continue
      const shortList = s.examples.slice(0, SHORT_RULE.examples)
      expect(
        shortList.some((ex) => !ex.outside && tagged(ex, variant)),
        `${s.id} 요약본`,
      ).toBe(true)
    }
  })
})

/**
 * 본문이 코퍼스에 대해 **말하는 숫자**를 코퍼스로 고정한다 (2026-09-17, 축 B).
 *
 * 연탁 절이 「음독 한자어는 거의 안 걸리고」라고 적고 있었는데 실제로는 연탁 자리의
 * 3분의 1이 음독이었다. 心不全 건과 같은 모양 — 본문이 한쪽만 가르치면 반대 경우를 만난
 * 학습자에게 틀린 것을 강화한다. 코퍼스가 갱신돼 서술이 어긋나면 여기서 걸린다.
 */
describe('연탁 절의 서술이 코퍼스와 맞는다', () => {
  const kanji = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/dict/kanji.json'), 'utf8'),
  ).kanji as Record<string, { on: string[]; kun: string[] }>
  const lookup = (k: string) => {
    const r = kanji[k]
    return r === undefined ? undefined : { onyomi: r.on, kunyomi: r.kun }
  }
  const idioms = JSON.parse(
    readFileSync(resolve(process.cwd(), 'public/dict/base.json'), 'utf8'),
  ).idioms as { headword: string; reading: string }[]

  /** 연탁이 걸린 자리를 음훈과 앞 글자로 모은다 */
  const spots = (() => {
    let on = 0
    let kun = 0
    let onAfterNOrLong = 0
    for (const it of idioms) {
      const d = decompose(it.headword, it.reading, lookup)
      if (!d.ok) continue
      let off = 0
      for (const s of d.segments) {
        const start = off
        off += s.surface.length
        if (!s.variants.includes('rendaku')) continue
        if (s.kind === 'kun') {
          kun++
          continue
        }
        on++
        if (start > 0 && 'んうい'.includes(it.reading[start - 1])) onAfterNOrLong++
      }
    }
    return { on, kun, onAfterNOrLong }
  })()

  it('「셋 중 둘이 훈독 쪽」 — 60~75% 사이다', () => {
    const share = spots.kun / (spots.kun + spots.on)
    expect(share, `훈독 ${spots.kun} / 음독 ${spots.on}`).toBeGreaterThan(0.6)
    expect(share).toBeLessThan(0.75)
  })

  it('「음독도 안 걸리는 건 아니다」 — 음독 연탁이 실제로 있다', () => {
    expect(spots.on).toBeGreaterThan(100)
  })

  it('「그 넷 중 셋은 앞이 ん 이나 장음」 — 70% 이상이다', () => {
    const share = spots.onAfterNOrLong / spots.on
    expect(share, `${spots.onAfterNOrLong} / ${spots.on}`).toBeGreaterThan(0.7)
  })
})
