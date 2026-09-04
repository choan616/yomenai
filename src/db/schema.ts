// 사용자 DB(IndexedDB) 스키마 v1. 사전 DB는 여기 넣지 않는다 (CLAUDE.md "사전 DB와 사용자 DB 분리")
import Dexie, { type Table } from 'dexie'
import type { LearningEvent } from '../core/types.ts'

export const DB_NAME = 'yomenai'
export const DB_VERSION = 1

/**
 * Dexie stores 정의. IndexedDB 는 primary key 변경이 불가능하므로 (mmtm 실패 사례,
 * context-notes 참조) v1에서 확정한다. 스토어 *추가*는 버전 올리기로 언제든 가능하다.
 *
 * 색인 의도.
 * - `[userId+id]`  PK. id 는 시간순 정렬되는 문자열이라 PK 순회가 곧 시간순이다
 * - `[userId+at]`  재생 대상 이벤트를 기간으로 자른다
 * - `[userId+idiomId+cardType]`  카드 1장의 이력 (오답 상세 화면)
 * - `[userId+deviceId+at]`  기기별 파일 동기화에서 자기 기기 이벤트만 뽑는다 (PLAN §5 원칙 3)
 * - `deletedAt`  묘비 색인. null 은 IndexedDB 유효 키가 아니라 색인에서 빠지므로
 *   이 색인에는 삭제된 행만 담긴다. 활성 이벤트 조회는 `[userId+at]` 순회 후 걸러낸다
 */
export const STORES = {
  events:
    '[userId+id], [userId+at], [userId+idiomId+cardType], [userId+deviceId+at], deletedAt',
} as const

export class YomenaiDB extends Dexie {
  declare events: Table<LearningEvent, [string, string]>

  constructor(options?: ConstructorParameters<typeof Dexie>[1]) {
    super(DB_NAME, options)
    this.version(DB_VERSION).stores(STORES)
  }
}

let instance: YomenaiDB | null = null

/** 앱 전역 인스턴스. 모듈 임포트만으로 IndexedDB 를 건드리지 않도록 지연 생성한다 */
export function db(): YomenaiDB {
  instance ??= new YomenaiDB()
  return instance
}
