// 단어장에 담고 빼는 이벤트 한 줄 — 다시보기·끝말잇기 말 카드가 같이 쓴다 (2026-10-06)
//
// 찾기(`Search.tsx`)의 담기와 같은 모양이다. 어느 묶음에 담을지는 「지금 담는 묶음」에서
// 오고 담을 때마다 묻지 않는다 (2026-09-25) — 한 번 누를 일이 두 번이 되지 않게.
import { recordStar } from '../core/session.ts'
import type { StarEvent } from '../core/types.ts'
import { getDeviceId } from '../db/device.ts'
import { LOCAL_USER_ID, appendEvent } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { loadCurrentList } from './currentList.ts'

/**
 * 담기/빼기 이벤트 한 건. 뺄 때는 묶음을 안 싣는다 — 어느 묶음이었는지는 담은 이벤트가 들고 있다.
 * `list` 를 주면 「지금 담는 묶음」 대신 그 묶음에 담는다 — 끝말잇기 말 카드가 쓴다 (2026-10-07)
 */
export function starEvent(idiomId: string, on: boolean, list?: string): StarEvent {
  return recordStar({
    idiomId,
    on,
    ...(on ? { list: list ?? loadCurrentList() } : {}),
    ctx: { userId: LOCAL_USER_ID, deviceId: getDeviceId(), at: Date.now() },
  })
}

/** 로그에 덧붙인다. 화면은 기다리지 않는다 — 집합 한 칸을 바로 갈아 끼우는 쪽이 손에 빠르다 */
export function appendStar(idiomId: string, on: boolean, list?: string): Promise<void> {
  return appendEvent(db(), starEvent(idiomId, on, list))
}
