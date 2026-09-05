// Dexie 의 실제 open/read/write 경로를 fake-indexeddb 위에서 검증한다.
// schema.test.ts 가 스키마 *정의*를 보는 반면 여기는 그 정의로 진짜 DB 가 열리는지를 본다
import { afterEach, describe, expect, it } from 'vitest'
import { IDBFactory, IDBKeyRange as FDBKeyRange } from 'fake-indexeddb'
import { YomenaiDB } from './schema.ts'
import {
  appendEvent,
  importEvents,
  listCardEvents,
  listDeviceEvents,
  listEvents,
  LOCAL_USER_ID,
  newEventId,
} from './events.ts'
import { replay } from '../core/replay.ts'
import type { LearningEvent, MistakeType, ReviewEvent } from '../core/types.ts'

const T0 = Date.UTC(2026, 0, 1)
const DAY = 86_400_000

const open: YomenaiDB[] = []

/** 테스트마다 새 IDBFactory 를 준다. 같은 DB 이름을 써도 저장소가 격리된다 */
function freshDb(): YomenaiDB {
  const db = new YomenaiDB({ indexedDB: new IDBFactory(), IDBKeyRange: FDBKeyRange })
  open.push(db)
  return db
}

afterEach(() => {
  for (const db of open.splice(0)) db.close()
})

let seq = 0
function review(fields: Partial<ReviewEvent> & { at: number; idiomId: string }): ReviewEvent {
  seq++
  return {
    id: newEventId(fields.at, () => (seq * 7) % 36 / 36),
    userId: LOCAL_USER_ID,
    deviceId: 'dev-a',
    cardType: 'reading',
    mistakeType: null as MistakeType | null,
    deletedAt: null,
    type: 'review',
    grade: 3,
    answer: '',
    expected: '',
    correct: true,
    elapsedMs: 1000,
    ...fields,
  }
}

describe('Dexie 스키마가 실제로 열린다', () => {
  it('v1 로 열리고 events 스토어가 생긴다', async () => {
    const db = freshDb()
    await db.open()
    expect(db.verno).toBe(1)
    expect(db.tables.map((t) => t.name)).toEqual(['events'])
  })

  it('선언한 복합 PK 와 색인이 실제 스토어에 그대로 붙는다', async () => {
    const db = freshDb()
    await db.open()
    const schema = db.table('events').schema
    expect(schema.primKey.keyPath).toEqual(['userId', 'id'])
    expect(schema.indexes.map((i) => i.name).sort()).toEqual([
      '[userId+at]', '[userId+deviceId+at]', '[userId+idiomId+cardType]', 'deletedAt',
    ])
  })
})

describe('appendEvent / listEvents', () => {
  it('기록한 이벤트를 그대로 읽어 온다', async () => {
    const db = freshDb()
    const e = review({ at: T0, idiomId: '1', mistakeType: 'RENDAKU', correct: false, grade: 1 })
    await appendEvent(db, e)
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([e])
  })

  it('시간순으로 돌려준다 — 넣은 순서와 무관하게', async () => {
    const db = freshDb()
    const late = review({ at: T0 + 2 * DAY, idiomId: '2' })
    const early = review({ at: T0, idiomId: '1' })
    await appendEvent(db, late)
    await appendEvent(db, early)
    expect((await listEvents(db, LOCAL_USER_ID)).map((e) => e.idiomId)).toEqual(['1', '2'])
  })

  it('기간으로 자른다', async () => {
    const db = freshDb()
    for (let d = 0; d < 5; d++) await appendEvent(db, review({ at: T0 + d * DAY, idiomId: `${d}` }))
    const mid = await listEvents(db, LOCAL_USER_ID, { from: T0 + DAY, to: T0 + 3 * DAY })
    expect(mid.map((e) => e.idiomId)).toEqual(['1', '2', '3'])
  })

  it('묘비(deletedAt)가 찍힌 이벤트는 빼고 준다', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1' }))
    await appendEvent(db, review({ at: T0 + DAY, idiomId: '2', deletedAt: T0 + 9 * DAY }))
    expect((await listEvents(db, LOCAL_USER_ID)).map((e) => e.idiomId)).toEqual(['1'])
  })

  it('같은 id 를 두 번 넣으면 거부한다 — append-only 로그의 보호막', async () => {
    const db = freshDb()
    const e = review({ at: T0, idiomId: '1' })
    await appendEvent(db, e)
    await expect(appendEvent(db, { ...e, correct: false })).rejects.toThrow()
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([e])
  })

  it('PK 에 userId 가 있어 다른 사용자의 같은 id 가 공존한다', async () => {
    const db = freshDb()
    const e = review({ at: T0, idiomId: '1' })
    await appendEvent(db, e)
    await appendEvent(db, { ...e, userId: 'other' })
    expect(await listEvents(db, LOCAL_USER_ID)).toHaveLength(1)
    expect(await listEvents(db, 'other')).toHaveLength(1)
  })
})

describe('listCardEvents — 카드 1장의 이력', () => {
  it('숙어·카드 타입으로 좁혀 시간순으로 준다', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1', cardType: 'reading' }))
    await appendEvent(db, review({ at: T0 + DAY, idiomId: '1', cardType: 'meaning' }))
    await appendEvent(db, review({ at: T0 + 2 * DAY, idiomId: '1', cardType: 'reading' }))
    await appendEvent(db, review({ at: T0 + 3 * DAY, idiomId: '2', cardType: 'reading' }))

    const hist = await listCardEvents(db, LOCAL_USER_ID, '1', 'reading')
    expect(hist.map((e) => e.at)).toEqual([T0, T0 + 2 * DAY])
  })
})

describe('listDeviceEvents — 동기화 업로드 대상', () => {
  it('이 기기 이벤트만 시간순으로 준다, 묘비 포함', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1', deviceId: 'dev-a' }))
    await appendEvent(db, review({ at: T0 + DAY, idiomId: '2', deviceId: 'dev-b' }))
    await appendEvent(db, review({ at: T0 + 2 * DAY, idiomId: '3', deviceId: 'dev-a', deletedAt: T0 + 9 * DAY }))

    const mine = await listDeviceEvents(db, LOCAL_USER_ID, 'dev-a')
    expect(mine.map((e) => e.idiomId)).toEqual(['1', '3'])
  })
})

describe('importEvents — 다른 기기 파일 병합', () => {
  it('새 이벤트를 그대로 들여온다', async () => {
    const db = freshDb()
    const remote = review({ at: T0, idiomId: '1', deviceId: 'dev-b' })
    const n = await importEvents(db, [remote])
    expect(n).toBe(1)
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([remote])
  })

  it('같은 id 를 다시 받아도 중복되지 않는다 — 재동기화가 멱등하다', async () => {
    const db = freshDb()
    const remote = review({ at: T0, idiomId: '1', deviceId: 'dev-b' })
    await importEvents(db, [remote])
    await importEvents(db, [remote])
    expect(await listEvents(db, LOCAL_USER_ID)).toHaveLength(1)
  })

  it('빈 배열은 아무 것도 안 한다', async () => {
    const db = freshDb()
    expect(await importEvents(db, [])).toBe(0)
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([])
  })
})

describe('저장 → 조회 → 재생 왕복', () => {
  it('DB 를 거쳐 나온 이벤트가 메모리 재생과 같은 상태를 낸다', async () => {
    const db = freshDb()
    const events: LearningEvent[] = [
      review({ at: T0, idiomId: '1', correct: false, grade: 1, mistakeType: 'SOKUON' }),
      review({ at: T0 + DAY, idiomId: '1' }),
      review({ at: T0 + DAY, idiomId: '2', cardType: 'meaning' }),
    ]
    for (const e of events) await appendEvent(db, e)

    const loaded = await listEvents(db, LOCAL_USER_ID)
    expect(replay(loaded)).toEqual(replay(events))
    expect(replay(loaded).cards.get('1:reading')!.mistakes).toEqual({ SOKUON: 1 })
  })
})
