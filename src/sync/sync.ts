// 기기별 파일 분리 동기화 (PLAN §5 원칙 3) — 각 기기가 자기 이벤트만 자기 파일
// (`reviews-{deviceId}.json`)에 쓰고, 남의 파일은 읽기만 한다. 쓰기 충돌이 구조적으로
// 없으므로 충돌 해결 UI가 필요 없다. 병합은 항상 합집합(bulkPut, 같은 id 는 같은 내용).
import { importEvents, listDeviceEvents, LOCAL_USER_ID } from '../db/events.ts'
import type { YomenaiDB } from '../db/schema.ts'
import type { LearningEvent } from '../core/types.ts'
import { googleDrive, type DriveClient, type DriveFileMeta } from './googleDrive.ts'

function fileNameFor(deviceId: string): string {
  return `reviews-${deviceId}.json`
}

/**
 * 동기화 진행 상황. 단계는 업로드 1 + 목록 조회 1 + 파일 수 n 이고, 파일 수는 목록을
 * 받아야 알 수 있어 그전까지 `total` 은 잠정값(2)이다
 */
export interface SyncProgress {
  phase: 'upload' | 'list' | 'download' | 'consolidate' | 'done'
  /** 끝난 단계 수 — 막대에 그대로 쓴다 */
  done: number
  total: number
  /** download 단계에서만 — 지금 몇 번째 파일인지 (1-based) */
  file?: { index: number; count: number }
}

export interface SyncResult {
  /** 이 기기에서 올린 이벤트 수(전체, 매번 파일을 통째로 덮어쓴다) */
  uploaded: number
  /** 다른 기기 파일에서 새로 들여온 이벤트 수 */
  downloaded: number
  /** 자동 정리가 돌았으면 그 결과. 접을 게 없었으면 undefined */
  consolidated?: ConsolidateResult
}

/**
 * 이 기간 동안 한 번도 갱신되지 않은 기기 파일을 "죽었다" 고 본다.
 *
 * 새 브라우저·프로파일·사이트 데이터 삭제마다 새 deviceId 가 생기는 건 막을 수 없다
 * (localStorage 는 브라우저 경계를 못 넘는다). 그래서 생기는 걸 막는 대신 **쌓인 걸 접는다.**
 * 살아 있는 기기 파일까지 접으면 그 기기가 다음 동기화에서 자기 파일을 다시 만들어
 * 지웠다 올렸다를 반복한다 — 그 churn 을 막는 게 이 기준의 전부다.
 */
export const STALE_DAYS = 30

/** 지금 기준으로 "죽은 파일" 판정선 (epoch ms) */
export function staleBefore(now: number = Date.now()): number {
  return now - STALE_DAYS * 24 * 60 * 60 * 1000
}

/**
 * 보관 파일이 아니면서 판정선보다 오래된 기기 파일인가.
 * `modifiedTime` 을 못 읽으면(옛 응답·가짜 Drive) 죽지 않은 것으로 본다 — 판단이
 * 안 서면 지우지 않는 쪽이 안전하다.
 */
function isStale(file: DriveFileMeta, cutoff: number): boolean {
  if (file.name === ARCHIVE_FILE_NAME) return false
  const t = Date.parse(file.modifiedTime ?? '')
  return Number.isFinite(t) && t < cutoff
}

/** `deviceId` 는 호출부(설정 화면)가 `getDeviceId()` 로 한 번 얻어 넘긴다 — 세션 훅과 같은 관례 */
export async function syncNow(
  database: YomenaiDB,
  deviceId: string,
  drive: DriveClient = googleDrive,
  onProgress?: (p: SyncProgress) => void,
  now: number = Date.now(),
): Promise<SyncResult> {
  if (!drive.isAuthenticated()) throw new Error('로그인이 필요합니다')

  const myFileName = fileNameFor(deviceId)

  onProgress?.({ phase: 'upload', done: 0, total: 2 })
  const mine = await listDeviceEvents(database, LOCAL_USER_ID, deviceId)
  await drive.uploadOrReplace(myFileName, JSON.stringify(mine))

  onProgress?.({ phase: 'list', done: 1, total: 2 })
  const files = await drive.listSyncFiles()
  const toDownload = files.filter((f) => f.name !== myFileName) // 방금 올린 자기 파일은 다시 받을 필요 없다
  // 죽은 파일이 있으면 내려받기 뒤에 한 단계를 더 돈다
  const cutoff = staleBefore(now)
  const willConsolidate = toDownload.some((f) => isStale(f, cutoff))
  const total = 2 + toDownload.length + (willConsolidate ? 1 : 0)

  let downloaded = 0
  for (const [i, file] of toDownload.entries()) {
    onProgress?.({ phase: 'download', done: 2 + i, total, file: { index: i + 1, count: toDownload.length } })
    const text = await drive.downloadFile(file.id)
    const events = JSON.parse(text) as LearningEvent[]
    downloaded += await importEvents(database, events)
  }

  let consolidated: ConsolidateResult | undefined
  if (willConsolidate) {
    onProgress?.({ phase: 'consolidate', done: 2 + toDownload.length, total })
    consolidated = await consolidateSyncFiles(database, deviceId, drive, { olderThan: cutoff })
  }

  onProgress?.({ phase: 'done', done: total, total })
  return { uploaded: mine.length, downloaded, consolidated }
}

/** 더는 쓰지 않는 기기들의 이벤트를 모아 두는 보관 파일. 아무도 쓰지 않고 읽기만 한다 */
export const ARCHIVE_FILE_NAME = 'reviews-archive.json'

export interface ConsolidateResult {
  /** 보관 파일에 담긴 이벤트 수 */
  archived: number
  /** 지운 옛 기기 파일 수 */
  removed: number
}

/**
 * 옛 기기 파일 정리 — 내 파일을 뺀 나머지 `reviews-*.json` 을 보관 파일 하나로 합치고 원본을 지운다.
 * 브라우저 데이터를 지우거나 프로파일이 바뀔 때마다 새 deviceId 가 생겨 죽은 파일이 쌓이는데,
 * 그냥 지우면 그 이벤트의 Drive 사본이 사라진다. 그래서 합친 뒤에 지운다.
 *
 * 기기별 파일 분리 원칙(PLAN §5 원칙 3)은 유지된다 — 보관 파일에 쓰는 주체는 정리 동작뿐이고
 * 살아 있는 기기는 여전히 자기 파일에만 쓴다. 다른 기기가 나중에 동기화하면 자기 파일을
 * 다시 만들어 전량을 올리므로(보관본과 중복되지만 합집합 병합이라 무해) 기록 손실도 없다.
 */
export async function consolidateSyncFiles(
  database: YomenaiDB,
  deviceId: string,
  drive: DriveClient = googleDrive,
  options: { olderThan?: number } = {},
): Promise<ConsolidateResult> {
  if (!drive.isAuthenticated()) throw new Error('로그인이 필요합니다')

  const myFileName = fileNameFor(deviceId)
  const files = await drive.listSyncFiles()
  const foreign = files.filter((f) => f.name !== myFileName)
  // `olderThan` 이 있으면 그보다 오래된 것만 (동기화 중 자동 정리). 없으면 전부 (설정 화면 버튼)
  const toRemove =
    options.olderThan === undefined
      ? foreign.filter((f) => f.name !== ARCHIVE_FILE_NAME)
      : foreign.filter((f) => isStale(f, options.olderThan!))
  if (toRemove.length === 0) return { archived: 0, removed: 0 }

  // 기존 보관 파일도 같이 읽어 합친다 — 두 번 정리해도 결과가 같다.
  // 살아 있는 기기 파일은 읽지도 지우지도 않는다
  const archive = foreign.find((f) => f.name === ARCHIVE_FILE_NAME)
  const targets = archive ? [archive, ...toRemove] : toRemove
  const byId = new Map<string, LearningEvent>()
  for (const file of targets) {
    const events = JSON.parse(await drive.downloadFile(file.id)) as LearningEvent[]
    await importEvents(database, events) // 지우기 전에 로컬 사본을 확보한다
    for (const e of events) byId.set(e.id, e)
  }

  // 업로드가 끝난 뒤에 지운다. 순서를 뒤집으면 업로드 실패 시 기록이 Drive 에서 사라진다
  const merged = [...byId.values()]
  await drive.uploadOrReplace(ARCHIVE_FILE_NAME, JSON.stringify(merged))
  for (const file of toRemove) await drive.deleteFile(file.id)

  return { archived: merged.length, removed: toRemove.length }
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
