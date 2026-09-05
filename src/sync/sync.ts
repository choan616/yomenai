// 기기별 파일 분리 동기화 (PLAN §5 원칙 3) — 각 기기가 자기 이벤트만 자기 파일
// (`reviews-{deviceId}.json`)에 쓰고, 남의 파일은 읽기만 한다. 쓰기 충돌이 구조적으로
// 없으므로 충돌 해결 UI가 필요 없다. 병합은 항상 합집합(bulkPut, 같은 id 는 같은 내용).
import { importEvents, listDeviceEvents, LOCAL_USER_ID } from '../db/events.ts'
import type { YomenaiDB } from '../db/schema.ts'
import type { LearningEvent } from '../core/types.ts'
import { googleDrive, type DriveClient } from './googleDrive.ts'

function fileNameFor(deviceId: string): string {
  return `reviews-${deviceId}.json`
}

export interface SyncResult {
  /** 이 기기에서 올린 이벤트 수(전체, 매번 파일을 통째로 덮어쓴다) */
  uploaded: number
  /** 다른 기기 파일에서 새로 들여온 이벤트 수 */
  downloaded: number
}

/** `deviceId` 는 호출부(설정 화면)가 `getDeviceId()` 로 한 번 얻어 넘긴다 — 세션 훅과 같은 관례 */
export async function syncNow(
  database: YomenaiDB,
  deviceId: string,
  drive: DriveClient = googleDrive,
): Promise<SyncResult> {
  if (!drive.isAuthenticated()) throw new Error('로그인이 필요합니다')

  const myFileName = fileNameFor(deviceId)

  const mine = await listDeviceEvents(database, LOCAL_USER_ID, deviceId)
  await drive.uploadOrReplace(myFileName, JSON.stringify(mine))

  const files = await drive.listSyncFiles()
  let downloaded = 0
  for (const file of files) {
    if (file.name === myFileName) continue // 방금 올린 자기 파일은 다시 받을 필요 없다
    const text = await drive.downloadFile(file.id)
    const events = JSON.parse(text) as LearningEvent[]
    downloaded += await importEvents(database, events)
  }

  return { uploaded: mine.length, downloaded }
}
