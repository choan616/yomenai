// syncNow 의 병합 로직을 가짜 Drive(메모리 Map) 위에서 검증한다.
// 핵심 검증 대상은 Phase 7 체크리스트의 "두 브라우저 프로파일에서 각각 학습 후
// 병합 시 이벤트 손실 0" — fake-indexeddb 로 기기 두 대를 흉내 낸다.
import { describe, expect, it } from 'vitest'
import { IDBFactory, IDBKeyRange as FDBKeyRange } from 'fake-indexeddb'
import { YomenaiDB } from '../db/schema.ts'
import { appendEvent, listEvents, LOCAL_USER_ID, newEventId } from '../db/events.ts'
import type { DriveClient, DriveFileMeta } from './googleDrive.ts'
import { syncNow } from './sync.ts'
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
