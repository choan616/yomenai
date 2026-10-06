// 세션 시작 때 읽는 문서가 다시 커지지 않게 막는 검사 — 읽는 비용이 곧 토큰이라 크기를 불변 조건으로 둔다 (2026-10-06)
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (p: string): string => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const kb = (s: string): number => Buffer.byteLength(s, 'utf8') / 1024

describe('시작 때 읽는 문서의 크기', () => {
  it('checklist.md 는 열린 항목만 둔다 (끝난 항목은 지운다)', () => {
    const c = read('checklist.md')
    expect(c.match(/^- \[x\]/gm) ?? []).toHaveLength(0)
    expect(kb(c)).toBeLessThan(40)
  })

  it('decisions.md 는 작게 유지한다 — 오래된 것은 보관본으로, 근거는 grep 으로', () => {
    expect(kb(read('decisions.md'))).toBeLessThan(30)
  })

  it('context-notes.md 는 새 근거만 둔다 — 쌓이면 docs/archive/ 로 옮긴다', () => {
    expect(kb(read('context-notes.md'))).toBeLessThan(60)
  })

  it('PLAN.md 도 한계를 넘지 않는다', () => {
    expect(kb(read('PLAN.md'))).toBeLessThan(40)
  })
})
