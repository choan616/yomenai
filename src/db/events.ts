// append-only 학습 이벤트 로그의 생성·기록·조회. 기존 이벤트는 절대 갱신하지 않는다
import { compareEvents, newEventId, type LearningEvent } from '../core/types.ts'
import type { YomenaiDB } from './schema.ts'

/** 당분간 고정. 복합 PK 에 자리를 잡아두기 위한 값이다 (CLAUDE.md 스키마 불변 조건) */
export const LOCAL_USER_ID = 'local'

// 이벤트 ID 생성은 도메인 쪽에 있다. 여기서 재수출해 호출부가 한 곳만 보게 한다
export { newEventId }

/** 이벤트 1건을 덧붙인다. 같은 id 가 이미 있으면 Dexie 가 거부한다 */
export async function appendEvent(db: YomenaiDB, event: LearningEvent): Promise<void> {
  await db.events.add(event)
}

/** 활성(미삭제) 이벤트를 시간순으로 읽는다 */
export async function listEvents(
  db: YomenaiDB,
  userId: string,
  range?: { from?: number; to?: number },
): Promise<LearningEvent[]> {
  const from = range?.from ?? Number.NEGATIVE_INFINITY
  const to = range?.to ?? Number.POSITIVE_INFINITY
  const rows = await db.events
    .where('[userId+at]')
    .between([userId, from], [userId, to], true, true)
    .toArray()
  return rows.filter((e) => e.deletedAt === null)
}

/** 카드 1장의 이력. 오답 상세 화면이 쓴다 */
export async function listCardEvents(
  db: YomenaiDB,
  userId: string,
  idiomId: string,
  cardType: LearningEvent['cardType'],
): Promise<LearningEvent[]> {
  const rows = await db.events
    .where('[userId+idiomId+cardType]')
    .equals([userId, idiomId, cardType])
    .toArray()
  return rows.filter((e) => e.deletedAt === null).sort(compareEvents)
}

/**
 * 이 기기가 만든 이벤트만 골라낸다 (묘비 포함) — 기기별 파일 분리 동기화의 업로드 대상
 * (PLAN §5 원칙 3). 다른 기기 파일을 건드리지 않으므로 쓰기 충돌이 없다
 */
export async function listDeviceEvents(
  db: YomenaiDB,
  userId: string,
  deviceId: string,
): Promise<LearningEvent[]> {
  return db.events
    .where('[userId+deviceId+at]')
    .between([userId, deviceId, Number.NEGATIVE_INFINITY], [userId, deviceId, Number.POSITIVE_INFINITY], true, true)
    .toArray()
}

/**
 * 다른 기기 파일에서 받아온 이벤트를 병합한다. id 가 같으면 내용도 같다는 게 append-only
 * 로그의 전제라 `bulkPut`(덮어쓰기)이 안전하다 — 몇 번을 다시 받아도 결과가 같다
 */
export async function importEvents(db: YomenaiDB, events: LearningEvent[]): Promise<number> {
  if (events.length === 0) return 0
  await db.events.bulkPut(events)
  return events.length
}

