// syncNow 의 병합 로직을 가짜 Drive(메모리 Map) 위에서 검증한다.
// 핵심 검증 대상은 Phase 7 체크리스트의 "두 브라우저 프로파일에서 각각 학습 후
// 병합 시 이벤트 손실 0" — fake-indexeddb 로 기기 두 대를 흉내 낸다.
import { describe, expect, it } from 'vitest'
import { IDBFactory, IDBKeyRange as FDBKeyRange } from 'fake-indexeddb'
import { YomenaiDB } from '../db/schema.ts'
import { appendEvent, listEvents, LOCAL_USER_ID, newEventId } from '../db/events.ts'
import type { DriveClient, DriveFileMeta } from './googleDrive.ts'
import {
  ARCHIVE_FILE_NAME,
  consolidateSyncFiles,
  resetLearning,
  STALE_DAYS,
  syncNow,
  type SyncProgress,
} from './sync.ts'
import type { MistakeType, ReviewEvent } from '../core/types.ts'

const T0 = Date.UTC(2026, 0, 1)

function freshDb(): YomenaiDB {
  return new YomenaiDB({ indexedDB: new IDBFactory(), IDBKeyRange: FDBKeyRange })
}

let seq = 0
function review(fields: Partial<ReviewEvent> & { at: number; idiomId: string; deviceId: string }): ReviewEvent {
  seq++
  return {
    id: newEventId(fields.at, () => ((seq * 7) % 36) / 36),
    userId: LOCAL_USER_ID,
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

/** 여러 인스턴스가 같은 Map 을 공유하면 진짜 Drive 폴더처럼 동작한다 */
class FakeDrive implements DriveClient {
  authed = true
  cloud: Map<string, string>
  /** 파일별 수정 시각(epoch ms). 안 주면 "방금" 으로 본다 — 자동 정리 대상이 아니다 */
  times: Map<string, number>
  constructor(cloud: Map<string, string>, times: Map<string, number> = new Map()) {
    this.cloud = cloud
    this.times = times
  }
  isAuthenticated() {
    return this.authed
  }
  async signIn() {
    return true
  }
  async restoreSession() {
    return true
  }
  signOut() {}
  async listSyncFiles(): Promise<DriveFileMeta[]> {
    return [...this.cloud.keys()].map((name) => ({
      id: name,
      name,
      modifiedTime: new Date(this.times.get(name) ?? Date.now()).toISOString(),
    }))
  }
  async downloadFile(fileId: string): Promise<string> {
    const content = this.cloud.get(fileId)
    if (content === undefined) throw new Error(`파일 없음: ${fileId}`)
    return content
  }
  async uploadOrReplace(fileName: string, content: string): Promise<void> {
    this.cloud.set(fileName, content)
  }
  async deleteFile(fileId: string): Promise<void> {
    this.cloud.delete(fileId)
  }
  async deleteSyncFiles(): Promise<number> {
    const n = this.cloud.size
    this.cloud.clear()
    return n
  }
}

describe('syncNow', () => {
  it('로그인하지 않았으면 거부한다', async () => {
    const drive = new FakeDrive(new Map())
    drive.authed = false
    await expect(syncNow(freshDb(), 'dev-a', drive)).rejects.toThrow('로그인')
  })

  it('이 기기 이벤트를 자기 파일로 올린다', async () => {
    const db = freshDb()
    const e = review({ at: T0, idiomId: '1', deviceId: 'dev-a' })
    await appendEvent(db, e)

    const cloud = new Map<string, string>()
    const result = await syncNow(db, 'dev-a', new FakeDrive(cloud))

    expect(result).toMatchObject({ uploaded: 1, downloaded: 0, restored: 0 })
    expect(JSON.parse(cloud.get('reviews-dev-a.json')!)).toEqual([e])
  })

  it('다른 기기 파일을 받아 병합하고, 자기 파일은 다시 받지 않는다', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1', deviceId: 'dev-a' }))

    const remote = review({ at: T0 + 1000, idiomId: '9', deviceId: 'dev-b' })
    const cloud = new Map([['reviews-dev-b.json', JSON.stringify([remote])]])

    const result = await syncNow(db, 'dev-a', new FakeDrive(cloud))

    expect(result.downloaded).toBe(1)
    expect((await listEvents(db, LOCAL_USER_ID)).map((e) => e.idiomId).sort()).toEqual(['1', '9'])
  })

  it('두 브라우저 프로파일에서 각각 학습 후 병합해도 이벤트 손실이 없다', async () => {
    const dbA = freshDb()
    const dbB = freshDb()
    const cloud = new Map<string, string>()
    const driveA = new FakeDrive(cloud)
    const driveB = new FakeDrive(cloud)

    // 두 기기가 오프라인 상태로 각자 3장씩 학습했다고 가정
    for (let i = 0; i < 3; i++) await appendEvent(dbA, review({ at: T0 + i, idiomId: `a${i}`, deviceId: 'dev-a' }))
    for (let i = 0; i < 3; i++) await appendEvent(dbB, review({ at: T0 + i, idiomId: `b${i}`, deviceId: 'dev-b' }))

    // A 가 먼저 동기화 (아직 B 는 안 올렸으니 받을 게 없다)
    await syncNow(dbA, 'dev-a', driveA)
    // B 가 동기화 (A 의 3건을 받는다)
    await syncNow(dbB, 'dev-b', driveB)
    // A 가 다시 동기화 (이제 B 의 3건을 받는다)
    await syncNow(dbA, 'dev-a', driveA)

    const idsOf = async (db: YomenaiDB) => (await listEvents(db, LOCAL_USER_ID)).map((e) => e.idiomId).sort()
    const expected = ['a0', 'a1', 'a2', 'b0', 'b1', 'b2']
    expect(await idsOf(dbA)).toEqual(expected)
    expect(await idsOf(dbB)).toEqual(expected)

    // 재동기화해도 멱등 — 중복이 생기지 않는다
    await syncNow(dbA, 'dev-a', driveA)
    expect(await idsOf(dbA)).toEqual(expected)
  })
})

describe('syncNow 진행 보고', () => {
  it('단계마다 보고하고, 목록을 받은 뒤 전체 단계 수가 확정된다', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1', deviceId: 'dev-a' }))
    const cloud = new Map([
      ['reviews-dev-b.json', JSON.stringify([review({ at: T0 + 1, idiomId: 'b', deviceId: 'dev-b' })])],
      [ARCHIVE_FILE_NAME, JSON.stringify([review({ at: T0 + 2, idiomId: 'c', deviceId: 'dev-c' })])],
    ])

    const seen: SyncProgress[] = []
    await syncNow(db, 'dev-a', new FakeDrive(cloud), (p) => seen.push(p))

    expect(seen.map((p) => p.phase)).toEqual([
      'list', 'restore', 'upload', 'download', 'download', 'done',
    ])
    // 목록 전에는 잠정 3, 받은 뒤엔 목록 1 + 되살리기 1 + 업로드 1 + 파일 2 = 5
    expect(seen.map((p) => p.total)).toEqual([3, 5, 5, 5, 5, 5])
    expect(seen.map((p) => p.done)).toEqual([0, 1, 2, 3, 4, 5])
    expect(seen.filter((p) => p.phase === 'download').map((p) => p.file)).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ])
  })

  it('받을 파일이 없으면 업로드·목록만 보고하고 100% 로 끝난다', async () => {
    const db = freshDb()
    const seen: SyncProgress[] = []
    await syncNow(db, 'dev-a', new FakeDrive(new Map()), (p) => seen.push(p))

    expect(seen.map((p) => p.phase)).toEqual(['list', 'restore', 'upload', 'done'])
    const last = seen[seen.length - 1]
    expect(last.done).toBe(last.total)
  })
})

describe('resetLearning', () => {
  it('로컬 이벤트를 비우고 Drive 파일을 지운다', async () => {
    const db = freshDb()
    for (let i = 0; i < 3; i++) await appendEvent(db, review({ at: T0 + i, idiomId: `x${i}`, deviceId: 'dev-a' }))
    const cloud = new Map([
      ['reviews-dev-a.json', '[]'],
      ['reviews-dev-b.json', '[]'],
    ])

    const result = await resetLearning(db, new FakeDrive(cloud))

    expect(result).toEqual({ localCleared: 3, driveDeleted: 2 })
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([])
    expect(cloud.size).toBe(0)
  })

  it('로그인 안 됐으면 로컬만 비우고 driveDeleted 는 -1', async () => {
    const db = freshDb()
    await appendEvent(db, review({ at: T0, idiomId: '1', deviceId: 'dev-a' }))
    const drive = new FakeDrive(new Map([['reviews-dev-a.json', '[]']]))
    drive.authed = false

    const result = await resetLearning(db, drive)

    expect(result.localCleared).toBe(1)
    expect(result.driveDeleted).toBe(-1)
    expect(await listEvents(db, LOCAL_USER_ID)).toEqual([])
  })
})

describe('consolidateSyncFiles', () => {
  it('내 파일을 뺀 옛 기기 파일을 보관 파일 하나로 합치고 원본을 지운다', async () => {
    const db = freshDb()
    const b = review({ at: T0 + 1, idiomId: 'b', deviceId: 'dev-b' })
    const c = review({ at: T0 + 2, idiomId: 'c', deviceId: 'dev-c' })
    const cloud = new Map([
      ['reviews-dev-a.json', '[]'],
      ['reviews-dev-b.json', JSON.stringify([b])],
      ['reviews-dev-c.json', JSON.stringify([c])],
    ])

    const result = await consolidateSyncFiles(db, 'dev-a', new FakeDrive(cloud))

    expect(result).toEqual({ archived: 2, removed: 2 })
    expect([...cloud.keys()].sort()).toEqual([ARCHIVE_FILE_NAME, 'reviews-dev-a.json'])
    const archived = JSON.parse(cloud.get(ARCHIVE_FILE_NAME)!) as typeof b[]
    expect(archived.map((e) => e.idiomId).sort()).toEqual(['b', 'c'])
  })

  it('지우기 전에 로컬로 흡수하고, 정리 뒤 다른 기기도 보관 파일에서 전부 받는다', async () => {
    const db = freshDb()
    const cloud = new Map([
      ['reviews-dev-b.json', JSON.stringify([review({ at: T0 + 1, idiomId: 'b', deviceId: 'dev-b' })])],
      ['reviews-dev-c.json', JSON.stringify([review({ at: T0 + 2, idiomId: 'c', deviceId: 'dev-c' })])],
    ])

    await consolidateSyncFiles(db, 'dev-a', new FakeDrive(cloud))
    expect((await listEvents(db, LOCAL_USER_ID)).map((e) => e.idiomId).sort()).toEqual(['b', 'c'])

    // 정리 뒤 합류한 기기도 보관 파일 하나로 과거 기록을 전부 받는다
    const fresh = freshDb()
    await syncNow(fresh, 'dev-d', new FakeDrive(cloud))
    expect((await listEvents(fresh, LOCAL_USER_ID)).map((e) => e.idiomId).sort()).toEqual(['b', 'c'])
  })

  it('두 번 정리해도 보관 파일 내용이 같고, 지울 게 없으면 아무것도 안 한다', async () => {
    const db = freshDb()
    const cloud = new Map([
      ['reviews-dev-a.json', '[]'],
      ['reviews-dev-b.json', JSON.stringify([review({ at: T0 + 1, idiomId: 'b', deviceId: 'dev-b' })])],
    ])
    const drive = new FakeDrive(cloud)

    await consolidateSyncFiles(db, 'dev-a', drive)
    const after = cloud.get(ARCHIVE_FILE_NAME)

    const second = await consolidateSyncFiles(db, 'dev-a', drive)
    expect(second).toEqual({ archived: 0, removed: 0 })
    expect(cloud.get(ARCHIVE_FILE_NAME)).toBe(after)
  })

  it('로그인하지 않았으면 거부한다', async () => {
    const drive = new FakeDrive(new Map())
    drive.authed = false
    await expect(consolidateSyncFiles(freshDb(), 'dev-a', drive)).rejects.toThrow('로그인')
  })
})

describe('자동 정리 — 오래 안 쓴 기기 파일 (2026-09-12)', () => {
  /** id 를 고정한 이벤트 — 보관 파일 내용을 그대로 대조하려고 */
  const ev = (id: string, deviceId: string, at: number) =>
    review({ id, at, idiomId: 'x', deviceId })
  const DAY = 24 * 60 * 60 * 1000
  const NOW = Date.parse('2026-09-12T00:00:00Z')
  const old = NOW - (STALE_DAYS + 5) * DAY
  const recent = NOW - 3 * DAY

  function cloudWith(): Map<string, string> {
    return new Map([
      ['reviews-dev-a.json', JSON.stringify([ev('a1', 'dev-a', 1)])],
      ['reviews-dead.json', JSON.stringify([ev('d1', 'dead', 2)])],
      ['reviews-live.json', JSON.stringify([ev('l1', 'live', 3)])],
    ])
  }

  it('죽은 파일은 보관 파일로 접고 살아 있는 기기 파일은 남긴다', async () => {
    const cloud = cloudWith()
    const times = new Map([['reviews-dead.json', old], ['reviews-live.json', recent]])
    const result = await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud, times), undefined, NOW)

    expect(result.consolidated).toMatchObject({ removed: 1 })
    expect(cloud.has('reviews-dead.json')).toBe(false)
    expect(cloud.has('reviews-live.json')).toBe(true)
    expect(cloud.has(ARCHIVE_FILE_NAME)).toBe(true)
  })

  it('죽은 파일의 기록은 보관 파일과 로컬에 남는다', async () => {
    const cloud = cloudWith()
    const times = new Map([['reviews-dead.json', old], ['reviews-live.json', recent]])
    const db = freshDb()
    await syncNow(db, 'dev-a', new FakeDrive(cloud, times), undefined, NOW)

    const archived = JSON.parse(cloud.get(ARCHIVE_FILE_NAME)!) as { id: string }[]
    expect(archived.map((e) => e.id)).toEqual(['d1'])
    // a1 은 내 파일(reviews-dev-a.json)에 있던 것 — 내 파일을 먼저 되받으므로 돌아온다
    // (2026-09-13 전에는 빈 로컬 DB 가 그 파일을 덮어써서 사라졌다)
    expect((await db.events.toArray()).map((e) => e.id).sort()).toEqual(['a1', 'd1', 'l1'])
  })

  it('죽은 파일이 없으면 정리를 안 돈다 — 살아 있는 기기끼리 churn 이 없다', async () => {
    const cloud = cloudWith()
    const times = new Map([['reviews-dead.json', recent], ['reviews-live.json', recent]])
    const result = await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud, times), undefined, NOW)

    expect(result.consolidated).toBeUndefined()
    expect(cloud.has(ARCHIVE_FILE_NAME)).toBe(false)
    expect(cloud.size).toBe(3)
  })

  it('보관 파일 자체는 오래돼도 안 지운다', async () => {
    const cloud = new Map([
      ['reviews-dev-a.json', JSON.stringify([ev('a1', 'dev-a', 1)])],
      [ARCHIVE_FILE_NAME, JSON.stringify([ev('z1', 'gone', 9)])],
    ])
    const result = await syncNow(
      freshDb(), 'dev-a', new FakeDrive(cloud, new Map([[ARCHIVE_FILE_NAME, old]])), undefined, NOW,
    )
    expect(result.consolidated).toBeUndefined()
    expect(cloud.has(ARCHIVE_FILE_NAME)).toBe(true)
  })

  it('정리 단계가 진행 보고에 들어간다', async () => {
    const cloud = cloudWith()
    const times = new Map([['reviews-dead.json', old], ['reviews-live.json', recent]])
    const seen: string[] = []
    await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud, times), (pr) => seen.push(pr.phase), NOW)
    expect(seen).toEqual([
      'list', 'restore', 'upload', 'download', 'download', 'consolidate', 'done',
    ])
  })

  it('설정 화면의 수동 정리는 시각을 안 본다 — 내 것 말고 전부 접는다', async () => {
    const cloud = cloudWith()
    const times = new Map([['reviews-dead.json', recent], ['reviews-live.json', recent]])
    const result = await consolidateSyncFiles(freshDb(), 'dev-a', new FakeDrive(cloud, times))
    expect(result.removed).toBe(2)
  })
})

describe('내 파일을 읽기 전에는 덮어쓰지 않는다 (2026-09-13)', () => {
  const ev = (id: string, deviceId: string, at: number) =>
    review({ id, at, idiomId: 'x', deviceId })
  const ev3 = () => [ev('a1', 'dev-a', 1), ev('a2', 'dev-a', 2), ev('a3', 'dev-a', 3)]

  it('로컬이 비고 deviceId 가 남아도 Drive 사본을 안 지운다 — 오히려 되살린다', async () => {
    const cloud = new Map<string, string>()
    const drive = new FakeDrive(cloud)

    const dbA = freshDb()
    for (const e of ev3()) await appendEvent(dbA, e)
    await syncNow(dbA, 'dev-a', drive)
    expect(JSON.parse(cloud.get('reviews-dev-a.json')!)).toHaveLength(3)

    // IndexedDB 만 비고 localStorage(deviceId) 는 남은 상태
    const lost = freshDb()
    const result = await syncNow(lost, 'dev-a', new FakeDrive(cloud))

    expect(JSON.parse(cloud.get('reviews-dev-a.json')!)).toHaveLength(3)
    expect(result.restored).toBe(3)
    expect(await listEvents(lost, LOCAL_USER_ID)).toHaveLength(3)
  })

  it('로컬에 새로 쌓인 것과 백업이 합집합으로 올라간다', async () => {
    const cloud = new Map<string, string>()
    const dbA = freshDb()
    for (const e of ev3()) await appendEvent(dbA, e)
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    // 로컬이 비고, 백업을 되받기 전에 새 기록이 하나 쌓였다
    const lost = freshDb()
    await appendEvent(lost, ev('a4', 'dev-a', 4))
    const result = await syncNow(lost, 'dev-a', new FakeDrive(cloud))

    expect(result.restored).toBe(3)
    expect(JSON.parse(cloud.get('reviews-dev-a.json')!)).toHaveLength(4)
  })

  it('되받는 것이 로컬을 덮어쓰지 않는다 — 묘비가 되살아나면 안 된다', async () => {
    const cloud = new Map<string, string>()
    const dbA = freshDb()
    for (const e of ev3()) await appendEvent(dbA, e)
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    // 로컬에서 a2 를 묘비 처리한 뒤 다시 동기화
    const rows = await dbA.events.toArray()
    const a2 = rows.find((e) => e.id === 'a2')!
    await dbA.events.put({ ...a2, deletedAt: 999 })
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    const still = (await dbA.events.toArray()).find((e) => e.id === 'a2')!
    expect(still.deletedAt).toBe(999)
    expect(await listEvents(dbA, LOCAL_USER_ID)).toHaveLength(2)
  })

  it('내 파일을 못 읽으면 업로드를 안 한다 — 못 읽은 파일은 덮어쓰지 않는다', async () => {
    const cloud = new Map<string, string>()
    const dbA = freshDb()
    for (const e of ev3()) await appendEvent(dbA, e)
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    class BrokenDrive extends FakeDrive {
      override async downloadFile(id: string): Promise<string> {
        if (id === 'reviews-dev-a.json') throw new Error('네트워크 오류')
        return super.downloadFile(id)
      }
    }
    const lost = freshDb()
    await expect(syncNow(lost, 'dev-a', new BrokenDrive(cloud))).rejects.toThrow('네트워크 오류')
    // 빈 로컬이 Drive 를 덮어쓰지 않았다
    expect(JSON.parse(cloud.get('reviews-dev-a.json')!)).toHaveLength(3)
  })

  it('진행 보고가 목록 → 되살리기 → 업로드 순이다', async () => {
    const cloud = new Map([['reviews-other.json', JSON.stringify([ev('o1', 'other', 1)])]])
    const seen: string[] = []
    await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud), (pr) => seen.push(pr.phase))
    expect(seen).toEqual(['list', 'restore', 'upload', 'download', 'done'])
  })
})
