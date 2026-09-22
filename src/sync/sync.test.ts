// syncNow 의 병합 로직을 가짜 Drive(메모리 Map) 위에서 검증한다.
// 상위 원칙은 **성취도는 깎이지 않는다** (PLAN §5 원칙 3, 2026-09-13 개정) —
// 로컬 건수는 절대 안 줄고, 백업도 줄어드는 쓰기를 거부한다.
import { describe, expect, it } from 'vitest'
import { IDBFactory, IDBKeyRange as FDBKeyRange } from 'fake-indexeddb'
import { YomenaiDB } from '../db/schema.ts'
import { appendEvent, listEvents, LOCAL_USER_ID, newEventId } from '../db/events.ts'
import type { DriveClient, DriveFileMeta } from './googleDrive.ts'
import {
  assertBackupGrows,
  BACKUP_FILE_NAME,
  BackupShrinkError,
  LEGACY_BACKUP_NAME,
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
    return [...this.cloud.keys()].map((name) => ({
      id: name,
      name,
      modifiedTime: new Date().toISOString(),
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

const ev = (id: string, deviceId: string, at: number) => review({ id, at, idiomId: 'x', deviceId })
const backupOf = (cloud: Map<string, string>) =>
  JSON.parse(cloud.get(BACKUP_FILE_NAME) ?? '[]') as { id: string }[]

describe('syncNow — 기본', () => {
  it('로그인하지 않았으면 거부한다', async () => {
    const drive = new FakeDrive(new Map())
    drive.authed = false
    await expect(syncNow(freshDb(), 'dev-a', drive)).rejects.toThrow('로그인')
  })

  it('폴더가 비어 있으면 백업과 전송 파일을 만든다', async () => {
    const cloud = new Map<string, string>()
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    const r = await syncNow(db, 'dev-a', new FakeDrive(cloud))

    expect(r).toMatchObject({ uploaded: 1, downloaded: 0, restored: 0, backupTotal: 1 })
    expect(backupOf(cloud).map((e) => e.id)).toEqual(['a1'])
  })

  it('평상시 폴더에는 backup.json 하나만 남는다', async () => {
    const cloud = new Map<string, string>()
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    await syncNow(db, 'dev-a', new FakeDrive(cloud))
    expect([...cloud.keys()]).toEqual([BACKUP_FILE_NAME])
  })

  it('두 기기 기록이 손실 없이 합쳐진다', async () => {
    const cloud = new Map<string, string>()
    const dbA = freshDb()
    const dbB = freshDb()
    await appendEvent(dbA, ev('a1', 'dev-a', T0))
    await appendEvent(dbB, ev('b1', 'dev-b', T0 + 1))

    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))
    await syncNow(dbB, 'dev-b', new FakeDrive(cloud))
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    expect((await listEvents(dbA, LOCAL_USER_ID)).map((e) => e.id).sort()).toEqual(['a1', 'b1'])
    expect((await listEvents(dbB, LOCAL_USER_ID)).map((e) => e.id).sort()).toEqual(['a1', 'b1'])
    expect(backupOf(cloud).map((e) => e.id).sort()).toEqual(['a1', 'b1'])
    expect([...cloud.keys()]).toEqual([BACKUP_FILE_NAME])
  })

  it('여러 번 돌려도 결과가 같다', async () => {
    const cloud = new Map<string, string>()
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    await syncNow(db, 'dev-a', new FakeDrive(cloud))
    const r = await syncNow(db, 'dev-a', new FakeDrive(cloud))
    expect(r.backupTotal).toBe(1)
    expect(backupOf(cloud)).toHaveLength(1)
  })
})

describe('성취도는 깎이지 않는다', () => {
  it('로컬이 비고 deviceId 가 남아도 백업에서 되살린다', async () => {
    const cloud = new Map<string, string>()
    const dbA = freshDb()
    for (const e of [ev('a1', 'dev-a', T0), ev('a2', 'dev-a', T0 + 1), ev('a3', 'dev-a', T0 + 2)]) {
      await appendEvent(dbA, e)
    }
    await syncNow(dbA, 'dev-a', new FakeDrive(cloud))

    // IndexedDB 만 비고 localStorage(deviceId) 는 남은 상태 (iOS 7일 규칙)
    const lost = freshDb()
    const r = await syncNow(lost, 'dev-a', new FakeDrive(cloud))

    expect(r.restored).toBe(3)
    expect(await listEvents(lost, LOCAL_USER_ID)).toHaveLength(3)
    expect(backupOf(cloud)).toHaveLength(3)
  })

  it('백업이 줄어드는 쓰기를 거부한다', () => {
    // 정상 동작에서는 병합을 먼저 하므로 이 선이 걸릴 일이 없다.
    // 병합을 빼먹는 류의 결함을 쓰기 직전에 잡는 방어선이라 규칙 자체를 고정한다
    expect(() => assertBackupGrows(3, 0)).toThrow(BackupShrinkError)
    expect(() => assertBackupGrows(3, 2)).toThrow(/3 → 2/)
    expect(() => assertBackupGrows(3, 3)).not.toThrow()
    expect(() => assertBackupGrows(3, 4)).not.toThrow()
    expect(() => assertBackupGrows(0, 0)).not.toThrow()
  })

  it('백업이 로컬보다 많으면 그 기록도 받아서 함께 올린다', async () => {
    const cloud = new Map<string, string>([
      [
        BACKUP_FILE_NAME,
        JSON.stringify([ev('z1', 'dev-z', T0), ev('z2', 'dev-z', T0 + 1), ev('z3', 'dev-z', T0 + 2)]),
      ],
    ])
    const r = await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud))
    expect(r.downloaded).toBe(3)
    expect(backupOf(cloud)).toHaveLength(3)
  })

  it('동기화는 로컬 이벤트를 지우지 않는다', async () => {
    const cloud = new Map<string, string>([[BACKUP_FILE_NAME, JSON.stringify([])]])
    const db = freshDb()
    for (const e of [ev('a1', 'dev-a', T0), ev('a2', 'dev-a', T0 + 1)]) await appendEvent(db, e)
    const before = (await listEvents(db, LOCAL_USER_ID)).length
    await syncNow(db, 'dev-a', new FakeDrive(cloud))
    expect((await listEvents(db, LOCAL_USER_ID)).length).toBeGreaterThanOrEqual(before)
  })

  it('되받기가 로컬 묘비를 되살리지 않는다', async () => {
    const cloud = new Map<string, string>()
    const db = freshDb()
    for (const e of [ev('a1', 'dev-a', T0), ev('a2', 'dev-a', T0 + 1)]) await appendEvent(db, e)
    await syncNow(db, 'dev-a', new FakeDrive(cloud))

    const a2 = (await db.events.toArray()).find((e) => e.id === 'a2')!
    await db.events.put({ ...a2, deletedAt: 999 })
    await syncNow(db, 'dev-a', new FakeDrive(cloud))

    expect((await db.events.toArray()).find((e) => e.id === 'a2')!.deletedAt).toBe(999)
    expect(await listEvents(db, LOCAL_USER_ID)).toHaveLength(1)
  })

  it('백업 쓰기가 실패하면 전송 파일을 안 지운다', async () => {
    const cloud = new Map<string, string>()
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    class BrokenBackup extends FakeDrive {
      override async uploadOrReplace(name: string, content: string): Promise<void> {
        if (name === BACKUP_FILE_NAME) throw new Error('업로드 실패')
        return super.uploadOrReplace(name, content)
      }
    }
    await expect(syncNow(db, 'dev-a', new BrokenBackup(cloud))).rejects.toThrow('업로드 실패')
    expect([...cloud.keys()]).toEqual(['sync-dev-a.json'])
    expect(JSON.parse(cloud.get('sync-dev-a.json')!)).toHaveLength(1)
  })
})

describe('옛 이름에서 이관', () => {
  it('reviews-* 와 보관 파일을 backup.json 으로 합치고 지운다', async () => {
    const cloud = new Map<string, string>([
      [LEGACY_BACKUP_NAME, JSON.stringify([ev('old1', 'dev-gone', T0)])],
      ['reviews-dev-b.json', JSON.stringify([ev('b1', 'dev-b', T0 + 1)])],
      ['reviews-dev-a.json', JSON.stringify([ev('a1', 'dev-a', T0 + 2)])],
    ])
    const r = await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud))

    expect([...cloud.keys()]).toEqual([BACKUP_FILE_NAME])
    expect(backupOf(cloud).map((e) => e.id).sort()).toEqual(['a1', 'b1', 'old1'])
    expect(r.folded).toBe(3)
    expect(r.restored).toBe(1) // reviews-dev-a.json 의 a1 이 내 것
  })

  it('이관은 한 번이면 끝난다 — 다시 돌려도 같다', async () => {
    const cloud = new Map<string, string>([
      [LEGACY_BACKUP_NAME, JSON.stringify([ev('old1', 'dev-gone', T0)])],
      ['reviews-dev-b.json', JSON.stringify([ev('b1', 'dev-b', T0 + 1)])],
    ])
    const db = freshDb()
    await syncNow(db, 'dev-a', new FakeDrive(cloud))
    const r = await syncNow(db, 'dev-a', new FakeDrive(cloud))
    expect(r.folded).toBe(0)
    expect(backupOf(cloud)).toHaveLength(2)
  })
})

describe('진행 보고', () => {
  it('목록 → 읽기 → 전송 → 백업 순으로 보고한다', async () => {
    const cloud = new Map<string, string>([
      [BACKUP_FILE_NAME, JSON.stringify([ev('z1', 'dev-z', T0)])],
      ['sync-dev-b.json', JSON.stringify([ev('b1', 'dev-b', T0 + 1)])],
    ])
    const seen: SyncProgress[] = []
    await syncNow(freshDb(), 'dev-a', new FakeDrive(cloud), (p) => seen.push(p))

    expect(seen.map((p) => p.phase)).toEqual([
      'list',
      'download',
      'download',
      'upload',
      'backup',
      'done',
    ])
    expect(seen.map((p) => p.done)).toEqual([0, 1, 2, 3, 4, 5])
    expect(seen.at(-1)).toMatchObject({ done: 5, total: 5 })
  })

  it('읽을 파일이 없으면 목록 → 전송 → 백업 만 보고한다', async () => {
    const seen: SyncProgress[] = []
    await syncNow(freshDb(), 'dev-a', new FakeDrive(new Map()), (p) => seen.push(p))
    expect(seen.map((p) => p.phase)).toEqual(['list', 'upload', 'backup', 'done'])
  })
})

describe('resetLearning', () => {
  it('로컬을 비우고 Drive 파일도 지운다', async () => {
    const cloud = new Map<string, string>([[BACKUP_FILE_NAME, JSON.stringify([ev('a1', 'dev-a', T0)])]])
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    const r = await resetLearning(db, new FakeDrive(cloud))
    expect(r.localCleared).toBe(1)
    expect(cloud.size).toBe(0)
    expect(await listEvents(db, LOCAL_USER_ID)).toHaveLength(0)
  })
})

/**
 * 전송 파일은 백업 쓰기가 실패했을 때의 보험이다. 그러니 담을 것은 **백업에 없는 것뿐**이고,
 * 그게 이 절이 지키는 성질이다 (2026-09-22). 통째로 올리던 때는 기기가 하나일 때
 * `mine ≈ all` 이라 같은 데이터를 한 동기화에 두 번 올렸다.
 */
describe('전송 파일은 백업에 없는 것만 담는다', () => {
  it('백업에 이미 있는 것은 빼고 올린다', async () => {
    const cloud = new Map<string, string>([
      [BACKUP_FILE_NAME, JSON.stringify([ev('a1', 'dev-a', T0), ev('a2', 'dev-a', T0 + 1)])],
    ])
    const db = freshDb()
    for (const e of [ev('a1', 'dev-a', T0), ev('a2', 'dev-a', T0 + 1), ev('a3', 'dev-a', T0 + 2)]) {
      await appendEvent(db, e)
    }
    class KeepTransport extends FakeDrive {
      sent: string[] = []
      override async uploadOrReplace(name: string, content: string): Promise<void> {
        if (name.startsWith('sync-')) this.sent = (JSON.parse(content) as { id: string }[]).map((e) => e.id)
        return super.uploadOrReplace(name, content)
      }
    }
    const drive = new KeepTransport(cloud)
    await syncNow(db, 'dev-a', drive)
    expect(drive.sent).toEqual(['a3'])
    // 백업은 여전히 전부를 담는다 — 줄어든 건 전송 파일뿐이다
    expect(backupOf(cloud).map((e) => e.id).sort()).toEqual(['a1', 'a2', 'a3'])
  })

  it('올릴 게 없으면 전송 파일을 아예 안 쓴다', async () => {
    const cloud = new Map<string, string>([
      [BACKUP_FILE_NAME, JSON.stringify([ev('a1', 'dev-a', T0)])],
    ])
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    class Watch extends FakeDrive {
      wroteTransport = false
      override async uploadOrReplace(name: string, content: string): Promise<void> {
        if (name.startsWith('sync-')) this.wroteTransport = true
        return super.uploadOrReplace(name, content)
      }
    }
    const drive = new Watch(cloud)
    await syncNow(db, 'dev-a', drive)
    expect(drive.wroteTransport).toBe(false)
    expect([...cloud.keys()]).toEqual([BACKUP_FILE_NAME])
  })

  /** 보험이 실제로 드는지 — 줄여 놓고 이게 깨지면 기록이 사라진다 */
  it('백업 쓰기가 실패해도 새 이벤트가 전송 파일에 남아 다음에 복구된다', async () => {
    const cloud = new Map<string, string>([
      [BACKUP_FILE_NAME, JSON.stringify([ev('a1', 'dev-a', T0)])],
    ])
    const db = freshDb()
    await appendEvent(db, ev('a1', 'dev-a', T0))
    await appendEvent(db, ev('a2', 'dev-a', T0 + 1))
    class BrokenBackup extends FakeDrive {
      override async uploadOrReplace(name: string, content: string): Promise<void> {
        if (name === BACKUP_FILE_NAME) throw new Error('업로드 실패')
        return super.uploadOrReplace(name, content)
      }
    }
    await expect(syncNow(db, 'dev-a', new BrokenBackup(cloud))).rejects.toThrow('업로드 실패')
    // 새 이벤트가 전송 파일에 남았다
    expect(JSON.parse(cloud.get('sync-dev-a.json')!).map((e: { id: string }) => e.id)).toEqual(['a2'])

    // 다른(빈) 기기가 이어받아도 둘 다 살아난다
    const other = freshDb()
    await syncNow(other, 'dev-b', new FakeDrive(cloud))
    expect(backupOf(cloud).map((e) => e.id).sort()).toEqual(['a1', 'a2'])
  })
})
