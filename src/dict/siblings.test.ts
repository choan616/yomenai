// 읽기 형제 항목 산출물 검증 — id 규칙, 부모와의 짝, 뜻, 채점만 받는 읽기 (2026-10-02)
//
// 임포트가 JMdict 한 항목에서 읽기를 하나만 골라 둘째 읽기가 사전에 없었다. 뜻이 갈린 읽기는 별도 항목
// (`{id}-{romaji}`)으로 올렸고, 학습 기록이 이 id 를 영구히 참조하므로 규칙이 깨지면 기록이 엉뚱한 읽기에
// 붙는다 — 산출물을 직접 읽어서 지킨다.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

interface Rec {
  id: string
  headword: string
  reading: string
  band: number
  pairIds: string[]
  readingKind: string
  altReadings?: string[]
  koMeaning: { definition: string; source: string; verified: boolean } | null
}

const FILES = ['base.json', 'band4.json'].map((f) => join('public', 'dict', f))
const ready = FILES.every(existsSync)

describe.runIf(ready)('읽기 형제 항목', () => {
  const load = (f: string) => (JSON.parse(readFileSync(f, 'utf8')) as { idioms: Rec[] }).idioms
  const [base, band4] = FILES.map(load) as [Rec[], Rec[]]
  const all = [...base, ...band4]
  const byId = new Map(all.map((r) => [r.id, r]))
  const siblings = all.filter((r) => r.id.includes('-'))
  const overrides = (
    JSON.parse(readFileSync(join('data', 'dict', 'korean-meaning-sibling-overrides.json'), 'utf8')) as {
      byId: Record<string, { definition: string; source: string; verified: boolean }>
    }
  ).byId

  it('형제 항목이 있다 — 빌드가 형제를 안 만들면 이 파일 전체가 헛돈다', () => {
    expect(siblings.length).toBeGreaterThan(100)
  })

  it('id 가 전부 유일하다', () => {
    expect(byId.size).toBe(all.length)
  })

  it('형제 id 는 `{부모 JMdict id}-{로마자}` 이고 부모가 사전에 있다', () => {
    for (const s of siblings) {
      expect(s.id).toMatch(/^\d+-[a-z0-9]+(-[a-z0-9]+)*$/)
      const parent = byId.get(s.id.split('-')[0]!)
      expect(parent, `${s.id} 의 부모가 없다`).toBeDefined()
      // 같은 표기의 다른 읽기다
      expect(parent!.headword).toBe(s.headword)
      expect(parent!.reading).not.toBe(s.reading)
    }
  })

  it('부모와 형제가 서로의 읽기를 채점에서 받는다', () => {
    for (const s of siblings) {
      const parent = byId.get(s.id.split('-')[0]!)!
      expect(s.altReadings ?? [], `${s.id} 가 부모 읽기를 못 받는다`).toContain(parent.reading)
      expect(parent.altReadings ?? [], `${parent.id} 가 형제 읽기를 못 받는다`).toContain(s.reading)
    }
  })

  it('형제마다 한국어 뜻이 있고, 덮어쓰기 기록의 뜻·출처·검수 표시를 그대로 싣는다', () => {
    // 뜻은 전부 `korean-meaning-sibling-overrides.json` 에서 온다 — 빌드가 검수 표시를 지어내지
    // 않는지를 본다. 앱 뜻 검수를 거친 형제는 그 파일에서 verified 가 true 로 바뀐다 (2026-10-06 첫 사례)
    for (const s of siblings) {
      expect(s.koMeaning?.definition?.trim(), `${s.id} 뜻이 비었다`).toBeTruthy()
      expect(s.koMeaning, `${s.id} 가 덮어쓰기 기록과 다르다`).toEqual(overrides[s.id])
    }
  })

  it('형제는 음독 분해가 있다 — 학습 장치가 붙어야 항목이다', () => {
    for (const s of siblings) expect(s.pairIds.length, `${s.id} 에 음독 쌍이 없다`).toBeGreaterThan(0)
  })

  it('밴드는 기본 번들(0~3)과 밴드 4 번들이 서로 맞는 쪽에 들어 있다', () => {
    for (const s of base) expect(s.band).toBeLessThanOrEqual(3)
    for (const s of band4) expect(s.band).toBe(4)
  })

  it('逆手 ぎゃくて 가 기본 사전에 있고 さかて 와 서로 짝이다 (이번 변경의 출발점)', () => {
    const s = byId.get('1693370-gyakute')
    expect(s).toMatchObject({ headword: '逆手', reading: 'ぎゃくて', band: 1 })
    expect(byId.get('1693370')?.altReadings).toContain('ぎゃくて')
    expect(base.includes(s!)).toBe(true)
  })

  it('平日 ひらび(부수 曰 의 이름)는 밴드 4 다 — 표기의 빈도를 물려받지 않는다', () => {
    const s = byId.get('1507720-hirabi')
    expect(s?.band).toBe(4)
    expect(band4.includes(s!)).toBe(true)
  })

  it('뜻이 같은 읽기는 항목이 아니라 채점만 받는다 (安否 あんぷ)', () => {
    expect(byId.get('1154230')?.altReadings).toContain('あんぷ')
    expect(all.some((r) => r.headword === '安否' && r.reading === 'あんぷ')).toBe(false)
  })
})
