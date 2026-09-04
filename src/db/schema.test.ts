// IndexedDB 스키마 v1 이 CLAUDE.md 불변 조건을 전부 지키는지 고정한다.
// PK 는 나중에 못 바꾸므로(mmtm 실패 사례) 이 테스트가 깨지면 스키마 쪽을 고쳐야 한다
import { describe, expect, it } from 'vitest'
import { DB_VERSION, STORES } from './schema.ts'
import type { MeaningKnownEvent, ReviewEvent } from '../core/types.ts'

/** Dexie stores 문자열에서 PK와 색인들을 뽑는다 */
function parse(spec: string): { primaryKey: string; indexes: string[] } {
  const [pk, ...rest] = spec.split(',').map((s) => s.trim())
  return { primaryKey: pk, indexes: rest }
}

function keyPath(compound: string): string[] {
  const m = /^\[(.+)\]$/.exec(compound)
  return m ? m[1].split('+') : [compound]
}

describe('스키마 불변 조건', () => {
  it('v1 이다 — 버전을 올리려면 마이그레이션을 먼저 합의한다', () => {
    expect(DB_VERSION).toBe(1)
  })

  it('모든 사용자 데이터 테이블의 복합 PK 에 userId 가 들어 있다', () => {
    for (const [table, spec] of Object.entries(STORES)) {
      const path = keyPath(parse(spec).primaryKey)
      expect(path.length, `${table} PK 가 단일 키다`).toBeGreaterThan(1)
      expect(path, `${table} PK 에 userId 가 없다`).toContain('userId')
    }
  })

  it('모든 테이블에 deletedAt 소프트 삭제 색인이 있다', () => {
    for (const [table, spec] of Object.entries(STORES)) {
      expect(parse(spec).indexes, `${table}`).toContain('deletedAt')
    }
  })

  it('이벤트 로그는 기기별·카드별 조회 색인을 가진다 (동기화·오답 상세)', () => {
    const { indexes } = parse(STORES.events)
    expect(indexes).toContain('[userId+at]')
    expect(indexes).toContain('[userId+idiomId+cardType]')
    expect(indexes).toContain('[userId+deviceId+at]')
  })
})

describe('이벤트 필드 불변 조건', () => {
  const review: ReviewEvent = {
    id: '0000000000abc-0000000000', userId: 'local', deviceId: 'dev', at: 0,
    idiomId: '1', cardType: 'reading', mistakeType: 'RENDAKU', deletedAt: null,
    type: 'review', grade: 1, answer: 'みかつき', expected: 'みかづき', correct: false, elapsedMs: 100,
  }
  const known: MeaningKnownEvent = {
    id: '0000000000abd-0000000000', userId: 'local', deviceId: 'dev', at: 0,
    idiomId: '1', cardType: 'meaning', mistakeType: null, deletedAt: null,
    type: 'meaningKnown', known: true,
  }

  it('모든 이벤트가 userId·deletedAt·cardType·mistakeType 을 가진다', () => {
    for (const e of [review, known]) {
      expect(Object.keys(e)).toEqual(
        expect.arrayContaining(['userId', 'deletedAt', 'cardType', 'mistakeType']),
      )
    }
  })

  it('오답 유형 필드는 해당 없음을 null 로 구분한다 — 필드 자체를 빼지 않는다', () => {
    expect(known.mistakeType).toBeNull()
    expect('mistakeType' in known).toBe(true)
  })
})
