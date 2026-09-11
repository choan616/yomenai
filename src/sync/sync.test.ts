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
  constructor(cloud: Map<string, string>) {
    this.cloud = cloud
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
    return [...this.cloud.keys()].map((name) => ({ id: name, name }))
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

    expect(result).toEqual({ uploaded: 1, downloaded: 0 })
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

    expect(seen.map((p) => p.phase)).toEqual(['upload', 'list', 'download', 'download', 'done'])
    // 목록 전에는 잠정 2, 받은 뒤엔 업로드 1 + 목록 1 + 파일 2 = 4
    expect(seen.map((p) => p.total)).toEqual([2, 2, 4, 4, 4])
    expect(seen.map((p) => p.done)).toEqual([0, 1, 2, 3, 4])
    expect(seen.filter((p) => p.phase === 'download').map((p) => p.file)).toEqual([
      { index: 1, count: 2 },
      { index: 2, count: 2 },
    ])
  })

  it('받을 파일이 없으면 업로드·목록만 보고하고 100% 로 끝난다', async () => {
    const db = freshDb()
    const seen: SyncProgress[] = []
    await syncNow(db, 'dev-a', new FakeDrive(new Map()), (p) => seen.push(p))

    expect(seen.map((p) => p.phase)).toEqual(['upload', 'list', 'done'])
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
