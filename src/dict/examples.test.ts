// 런타임 예문 번들 검증 — base.json 에 실제로 있는 숙어만 참조하고, 문장이 길이 상한을 지키는지
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BASE = join('public', 'dict', 'base.json')
const EXAMPLES = join('public', 'dict', 'examples.json')

describe.runIf(existsSync(EXAMPLES) && existsSync(BASE))('examples.json', () => {
  const base = JSON.parse(readFileSync(BASE, 'utf8')) as { idioms: { id: string }[] }
  const baseIds = new Set(base.idioms.map((i) => i.id))
  const data = JSON.parse(readFileSync(EXAMPLES, 'utf8')) as {
    _meta: { idiomCount: number }
    byId: Record<string, string[]>
  }

  it('_meta.idiomCount 와 실제 항목 수가 일치한다', () => {
    expect(Object.keys(data.byId).length).toBe(data._meta.idiomCount)
  })

  it('전부 base.json 에 실제로 있는 숙어를 가리킨다 (밴드 4·탈락 숙어 안 섞임)', () => {
    for (const id of Object.keys(data.byId)) expect(baseIds.has(id)).toBe(true)
  })

  it('숙어당 1~3 문장, 60자 이하, 중복 없음', () => {
    for (const sentences of Object.values(data.byId)) {
      expect(sentences.length).toBeGreaterThan(0)
      expect(sentences.length).toBeLessThanOrEqual(3)
      expect(new Set(sentences).size).toBe(sentences.length)
      for (const s of sentences) expect(s.length).toBeLessThanOrEqual(60)
    }
  })
})
