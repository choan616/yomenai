// 이번 주 띠의 한 줄 문구 — 홈·요약용. 긍정형만 쓴다 (2026-09-30)
//
// 사용자 지시 「빠진 날에 구멍이 생겼다는 네거티브 메시지는 노출하지 않는다」. 끊긴 뒤엔
// 현재 연속을 아예 말하지 않는다 — 「0일째」도 안 쓴다. 이정표 문구는 보상 개념이 생기기
// 전까지의 자리다 (streak.ts 머리 주석).
import type { ReactNode } from 'react'
import type { DayRecord } from '../core/attendance.ts'
import { milestoneLabel, nextMilestone, type StreakRecord } from '../core/streak.ts'
import { QUICK_SESSION_LIMIT } from './settings.ts'

/** 오늘 달성한 이정표. 없으면 undefined */
function todayMilestone(streak: StreakRecord, todayKey: string) {
  const last = streak.milestones.at(-1)
  return last?.date === todayKey ? last : undefined
}

/** 홈의 한 줄 — 오늘 칸을 채웠는지에 따라 갈린다 */
export function homeLine(streak: StreakRecord, todayKey: string): ReactNode {
  if (streak.todayDone) {
    const hit = todayMilestone(streak, todayKey)
    if (hit) return <>오늘로 <b>{milestoneLabel(hit.days)}</b>이에요</>
    if (streak.current >= 2) return <><b>{streak.current}일째</b> 이어가고 있어요</>
    return <>오늘 칸을 채웠어요</>
  }
  // 어제까지 이어진 연속이 있으면 오늘 3장이 그걸 한 칸 늘린다
  if (streak.current >= 1) {
    const next = streak.current + 1
    if (nextMilestone(streak.current) === next) {
      return <>{QUICK_SESSION_LIMIT}장이면 <b>{milestoneLabel(next)}</b>이에요</>
    }
    return <>{QUICK_SESSION_LIMIT}장이면 <b>{next}일째</b>로 이어져요</>
  }
  return <>{QUICK_SESSION_LIMIT}장이면 오늘 칸이 채워져요</>
}

/**
 * 요약의 한 줄 — 이번 세션이 오늘 칸에 무엇을 했나. 세션 전후를 비교한다.
 * 아직 문턱에 못 미쳤으면(짧은 재도전 등) 남은 장수를 말한다 — "모자랐다"가 아니라 "N장 더"
 */
export function summaryLine(
  before: StreakRecord,
  after: StreakRecord,
  todayAfter: DayRecord | undefined,
  todayKey: string,
): ReactNode {
  if (!after.todayDone) {
    const left = QUICK_SESSION_LIMIT - (todayAfter?.count ?? 0)
    return <><b>{left}장</b> 더 하면 오늘 칸이 채워져요</>
  }
  const hit = todayMilestone(after, todayKey)
  if (hit && todayMilestone(before, todayKey)?.id !== hit.id) {
    return <>오늘로 <b>{milestoneLabel(hit.days)}</b>이에요</>
  }
  if (after.current >= 2) return <><b>{after.current}일째</b> 이어가고 있어요</>
  return <>오늘 칸을 채웠어요</>
}
