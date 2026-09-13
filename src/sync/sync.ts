// 백업과 동기화 전송을 가른다 (PLAN §5 원칙 3, 2026-09-13 개정).
//
// **성취도는 깎이지 않는다** 가 상위 원칙이고, 파일 구조는 그걸 위한 수단이다.
// 학습 기록이 줄면 사용자가 쌓아 온 증거가 사라져 계속할 이유가 깎인다 —
// 이 앱이 Phase 11 「지속의 유인」 에서 통째로 다루는 바로 그 문제다.
//
// 역할이 다른 파일 둘.
//
// - `backup.json`   전체 로그. 오래 산다. **지우면 안 되는 것.** 이름이 그렇게 말한다
// - `sync-<기기>.json`  그 기기가 올린 것. 짧게 산다. 백업에 접히면 바로 지운다.
//   기기마다 이름이 달라 **쓰기 충돌이 없다** — 새 이벤트가 백업 쓰기 경합에 져도
//   이 파일이 아직 살아 있어 다음 동기화가 메운다
//
// 옛 이름(`reviews-*.json`, `reviews-archive.json`)은 읽어서 접고 지운다 — 일회성 이관이
// 따로 없고 동기화 한 번이면 끝난다.
import { importMissingEvents, listAllEvents, listDeviceEvents, LOCAL_USER_ID } from '../db/events.ts'
import type { YomenaiDB } from '../db/schema.ts'
import type { LearningEvent } from '../core/types.ts'
import { googleDrive, type DriveClient, type DriveFileMeta } from './googleDrive.ts'

/** 전체 로그를 담는 유일한 백업 파일 */
export const BACKUP_FILE_NAME = 'backup.json'
/** 2026-09-13 이전의 보관 파일 이름. 읽어서 백업에 접고 지운다 */
export const LEGACY_BACKUP_NAME = 'reviews-archive.json'

const TRANSPORT_PREFIX = 'sync-'
const LEGACY_TRANSPORT_PREFIX = 'reviews-'

function transportNameFor(deviceId: string): string {
  return `${TRANSPORT_PREFIX}${deviceId}.json`
}

/** 백업 파일인가 (옛 이름 포함) */
function isBackup(name: string): boolean {
  return name === BACKUP_FILE_NAME || name === LEGACY_BACKUP_NAME
}

/** 전송 파일인가 (옛 이름 포함). 폴더에 섞여 든 남의 파일은 건드리지 않는다 */
function isTransport(name: string): boolean {
  if (isBackup(name)) return false
  return name.startsWith(TRANSPORT_PREFIX) || name.startsWith(LEGACY_TRANSPORT_PREFIX)
}

/**
 * 동기화 진행 상황. 단계는 목록 1 + 읽을 파일 n + 전송 1 + 백업 1 이고,
 * 파일 수는 목록을 받아야 알 수 있어 그전까지 `total` 은 잠정값(3)이다
 */
export interface SyncProgress {
  phase: 'list' | 'download' | 'upload' | 'backup' | 'done'
  /** 끝난 단계 수 — 막대에 그대로 쓴다 */
  done: number
  total: number
  /** download 단계에서만 — 지금 몇 번째 파일인지 (1-based) */
  file?: { index: number; count: number }
}

export interface SyncResult {
  /** 이 기기가 전송 파일에 올린 이벤트 수 */
  uploaded: number
  /** Drive 에서 새로 들여온 이벤트 수 */
  downloaded: number
  /** 그중 이 기기가 만든 것 — 로컬이 비었다 되살아난 경우에만 0 보다 크다 */
  restored: number
  /** 백업에 접고 지운 전송·옛 파일 수 */
  folded: number
  /** 백업 파일에 담긴 전체 이벤트 수 */
  backupTotal: number
}

/** 백업이 줄어드는 쓰기를 막는다 — append-only 로그라 작아지는 정상적인 경우가 없다 */
export class BackupShrinkError extends Error {
  before: number
  after: number
  constructor(before: number, after: number) {
    super(`백업이 줄어듭니다 (${before} → ${after}). 안전을 위해 중단했어요.`)
    this.name = 'BackupShrinkError'
    this.before = before
    this.after = after
  }
}

/**
 * 백업은 줄어들 수 없다 — append-only 로그라 작아지는 정상적인 경우가 없다.
 * 병합을 빼먹는 류의 결함(2026-09-13 P0 가 정확히 그랬다)을 쓰기 직전에 잡는 방어선이다.
 */
export function assertBackupGrows(before: number, after: number): void {
  if (after < before) throw new BackupShrinkError(before, after)
}

function parseEvents(text: string, label: string): LearningEvent[] {
  const parsed = JSON.parse(text) as unknown
  if (!Array.isArray(parsed)) throw new Error(`${label} 이 이벤트 배열이 아닙니다`)
  return parsed as LearningEvent[]
}

/** `deviceId` 는 호출부(설정 화면)가 `getDeviceId()` 로 한 번 얻어 넘긴다 — 세션 훅과 같은 관례 */
export async function syncNow(
  database: YomenaiDB,
  deviceId: string,
  drive: DriveClient = googleDrive,
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  if (!drive.isAuthenticated()) throw new Error('로그인이 필요합니다')

  const myTransport = transportNameFor(deviceId)

  onProgress?.({ phase: 'list', done: 0, total: 3 })
  const files = await drive.listSyncFiles()
  const backups = files.filter((f) => isBackup(f.name))
  const transports = files.filter((f) => isTransport(f.name))
  // 내 전송 파일도 읽는다. 브라우저가 IndexedDB 만 비우는 일이 있어서(iOS 는 미사용 7일에
  // 비운다) 로컬만 보고 쓰면 그때 Drive 사본까지 지운다 — 읽기 전에는 쓰지 않는다
  const toRead: DriveFileMeta[] = [...backups, ...transports]
  const total = 3 + toRead.length

  // 되살린 건수는 내 이벤트 수의 증가분으로 센다 — 파일 간 중복이 겹쳐도 부풀지 않는다
  const mineBefore = (await listDeviceEvents(database, LOCAL_USER_ID, deviceId)).length
  let downloaded = 0
  let backupBefore = 0
  for (const [i, file] of toRead.entries()) {
    onProgress?.({ phase: 'download', done: 1 + i, total, file: { index: i + 1, count: toRead.length } })
    const events = parseEvents(await drive.downloadFile(file.id), file.name)
    if (isBackup(file.name)) backupBefore = Math.max(backupBefore, events.length)
    // 덮어쓰지 않고 없는 것만 받는다 — 같은 id 면 내용도 같다는 게 append-only 의 전제라
    // 덮어써서 얻는 게 없고, 로컬에서 생긴 변화(묘비)를 되돌릴 위험만 있다
    downloaded += await importMissingEvents(database, events)
  }

  const mine = await listDeviceEvents(database, LOCAL_USER_ID, deviceId)
  const restored = mine.length - mineBefore

  onProgress?.({ phase: 'upload', done: 1 + toRead.length, total })
  await drive.uploadOrReplace(myTransport, JSON.stringify(mine))

  // 백업 = 이 기기가 아는 전부. 줄어들면 쓰지 않는다
  onProgress?.({ phase: 'backup', done: 2 + toRead.length, total })
  const all = await listAllEvents(database, LOCAL_USER_ID)
  assertBackupGrows(backupBefore, all.length)
  await drive.uploadOrReplace(BACKUP_FILE_NAME, JSON.stringify(all))

  // **백업 쓰기가 성공한 뒤에만** 지운다. 순서를 뒤집으면 실패 시 기록이 사라진다.
  // 접을 이름만 골라 다시 목록을 받는다 — 방금 쓴 내 전송 파일은 처음 목록에 없었고,
  // 이름을 모르는 남의 새 파일은 건드리면 안 된다
  const foldNames = new Set([
    ...transports.map((f) => f.name),
    ...backups.filter((f) => f.name === LEGACY_BACKUP_NAME).map((f) => f.name),
    myTransport,
  ])
  // 접은 수는 **원래 있던 파일만** 센다. 내 전송 파일은 이번 동기화에서 만들었다 지우는
  // 것이라 사용자에게 보고할 변화가 아니다
  const preexisting = new Set(files.map((f) => f.name))
  let folded = 0
  for (const file of await drive.listSyncFiles()) {
    if (!foldNames.has(file.name)) continue
    await drive.deleteFile(file.id)
    if (preexisting.has(file.name)) folded++
  }

  onProgress?.({ phase: 'done', done: total, total })
  return { uploaded: mine.length, downloaded, restored, folded, backupTotal: all.length }
}

export interface ResetResult {
  /** 지운 로컬 이벤트 수 */
  localCleared: number
  /** 지운 Drive 동기화 파일 수 (로그인 안 됐으면 -1) */
  driveDeleted: number
}

/**
 * 학습 기록 초기화 — 로컬 이벤트 로그를 비우고, 로그인돼 있으면 Drive 동기화 파일도 지운다.
 * append-only 원칙의 예외지만 사용자가 명시적으로 요청한 파괴적 동작이라 통째 삭제한다.
 * Drive 파일을 안 지우면 다음 sync 때 되살아나므로 둘을 한 동작으로 묶는다.
 */
export async function resetLearning(
  database: YomenaiDB,
  drive: DriveClient = googleDrive,
): Promise<ResetResult> {
  const localCleared = await database.events.count()
  await database.events.clear()

  let driveDeleted = -1
  if (drive.isAuthenticated()) {
    driveDeleted = await drive.deleteSyncFiles()
  }

  return { localCleared, driveDeleted }
}
