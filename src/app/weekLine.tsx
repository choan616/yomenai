// 이번 주 띠의 한 줄 문구 — 홈·요약용. 긍정형만 쓴다 (2026-09-30)
//
// 사용자 지시 「빠진 날에 구멍이 생겼다는 네거티브 메시지는 노출하지 않는다」. 끊긴 뒤엔
// 현재 연속을 아예 말하지 않는다 — 「0일째」도 안 쓴다. 이정표 문구는 보상 개념이 생기기
// 전까지의 자리다 (streak.ts 머리 주석).
//
// **「3장」을 그대로 쓴다.** 2026-10-02 에 「조금만 해도」로 바꿨다가 같은 날 사용자가 기각했다 —
// 「20장 중 3장을 학습하면 카운트한다는 것이 명확해서 3장이라는 문구는 설득력을 갖게 되었다」.
// 숫자가 거슬렸던 건 그 수가 무엇을 가리키는지 흐렸기 때문이고, 그게 풀리자 숫자 쪽이 더 낫다.
// 「조금만」은 1장·2장도 되는 것처럼 읽히는 문제도 있었다.
//
// 그 수가 설득력을 갖는 조건 둘 — 둘 다 테스트가 지킨다.
// 1. **문턱은 사용자 설정과 무관하다.** `QUICK_SESSION_LIMIT`(3)은 설정의 최소값보다 작아
//    어떤 세션 장수에서도 「N장 중 3장」이 성립한다 (`settings.test.ts`·`attendance.test.ts`)
// 2. **세션을 완주해야 채워지는 게 아니다.** 읽기 답은 「다음」을 누를 때, 뜻 답은 고를 때 그
//    자리에서 기록되고(`useStudySession` 의 `record`) 달력은 채점 수를 센다. 20장 세션에서
//    3장만 넘기고 나가도 칸은 채워진다 (`report-attendance.spec.ts` 가 재현한다)
import type { ReactNode } from 'react'
import type { DayRecord } from '../core/attendance.ts'
import { milestoneLabel, nextMilestone, type StreakRecord } from '../core/streak.ts'
import { QUICK_SESSION_LIMIT } from './settings.ts'

/** 오늘 달성한 이정표. 없으면 undefined */
function todayMilestone(streak: StreakRecord, todayKey: string) {
  const last = streak.milestones.at(-1)
  return last?.date === todayKey ? last : undefined
}

/**
 * 홈 띠와 달력 유도가 같이 쓰는 한 줄 — 오늘 칸을 채웠는지에 따라 갈린다.
 *
 * `todayCount` 는 **오늘 이미 채점한 수**다. 0 이면 문턱 그대로 「3장이면」, 1~2 면
 * **남은 장수**를 말한다 (2026-10-02 — 그 전엔 2장을 한 사람에게도 「3장이면」이라고 해서
 * 실제 남은 양과 어긋났다. 달력·요약은 그때도 남은 장수를 말하고 있었다).
 * 어느 쪽이든 뒷말은 같다 — 오늘 칸이 채워지거나, 연속이 하루 늘거나, 이정표에 닿는다
 */
export function homeLine(streak: StreakRecord, todayKey: string, todayCount = 0): ReactNode {
  if (streak.todayDone) {
    const hit = todayMilestone(streak, todayKey)
    if (hit) return <>오늘로 <b>{milestoneLabel(hit.days)}</b>이에요</>
    if (streak.current >= 2) return <><b>{streak.current}일째</b> 이어가고 있어요</>
    return <>오늘 칸을 채웠어요</>
  }
  const need =
    todayCount > 0 ? (
      <>
        <b>{QUICK_SESSION_LIMIT - todayCount}장</b> 더 하면
      </>
    ) : (
      <>{QUICK_SESSION_LIMIT}장이면</>
    )
  // 어제까지 이어진 연속이 있으면 오늘 문턱을 넘는 것이 그걸 한 칸 늘린다
  if (streak.current >= 1) {
    const next = streak.current + 1
    if (nextMilestone(streak.current) === next) {
      return <>{need} <b>{milestoneLabel(next)}</b>이에요</>
    }
    return <>{need} <b>{next}일째</b>로 이어져요</>
  }
  return <>{need} 오늘 칸이 채워져요</>
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
