// append-only 학습 이벤트 로그의 생성·기록·조회. 기존 이벤트는 절대 갱신하지 않는다
import { compareEvents, type LearningEvent } from '../core/types.ts'
import type { YomenaiDB } from './schema.ts'

/** 당분간 고정. 복합 PK 에 자리를 잡아두기 위한 값이다 (CLAUDE.md 스키마 불변 조건) */
export const LOCAL_USER_ID = 'local'

const ID_RANDOM_LEN = 10

/**
 * 시간순으로 정렬되는 이벤트 ID.
 * `at` 을 base36 13자리로 고정 폭 인코딩해 문자열 비교가 곧 시간 비교가 되게 하고,
 * 뒤에 난수를 붙여 같은 밀리초·다른 기기의 충돌을 막는다.
 */
export function newEventId(at: number, rand: () => number = Math.random): string {
  const ts = Math.floor(at).toString(36).padStart(13, '0')
  let tail = ''
  for (let i = 0; i < ID_RANDOM_LEN; i++) tail += Math.floor(rand() * 36).toString(36)
  return `${ts}-${tail}`
}

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

