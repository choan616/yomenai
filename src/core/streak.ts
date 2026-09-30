// 연속 학습 기록 — 현재 연속·최장·이정표(1주·2주·4주…). 나중의 보상 개념이 딛고 설 파생값 (2026-09-30)
//
// 2026-09-06/07 절에서 스트릭을 기각한 근거는 "끊기면 잃는다"는 손실 회피였다. 이 파일은
// 사용자의 명시 지시로 그걸 부분 번복한다 — **끊김은 말하지 않는다**는 조건이다. 그래서
// 여기서 내는 값에 "끊겼다"는 정보가 없다. 끊긴 뒤 `current` 는 0 이고 화면은 그때 현재
// 연속을 아예 안 말한다. `longest`·`milestones` 는 줄지 않는다 (PLAN §5 원칙 3).
//
// 저장하지 않는다. 채점 로그가 append-only 라 언제 다시 세도 같은 값이다(buildAttendance 와
// 같은 원칙). 보상을 "받는" 행위가 생기면 그 이벤트가 `Milestone.id` 를 참조한다.
import { shiftDateKey, type DayRecord } from './attendance.ts'

/** 이정표 사다리 — 일수. 1·2·4·8·12주 */
export const STREAK_MILESTONES = [7, 14, 28, 56, 84] as const

export interface Milestone {
  /**
   * 안정 id — `streak{일수}:{달성일}`. 로그가 같으면 언제 다시 세도 같은 값이라
   * 나중에 보상 이벤트가 "이 달성은 이미 보상했다"를 가리는 키로 쓴다
   */
  id: string
  days: (typeof STREAK_MILESTONES)[number]
  /** 연속이 이 길이에 닿은 날 (YYYY-MM-DD) */
  date: string
}

export interface StreakRecord {
  /**
   * 지금 이어지고 있는 연속 일수. 오늘 했으면 오늘까지, 아직 안 했으면 **어제까지** —
   * 오늘은 아직 끝나지 않았으니 어제까지의 연속은 살아 있다. 어제도 안 했으면 0
   */
  current: number
  /** 오늘 칸이 채워졌나 (`touched` 이상) */
  todayDone: boolean
  longest: number
  /** 달성 순. 같은 이정표를 연속이 끊긴 뒤 다시 채우면 또 들어간다 */
  milestones: Milestone[]
}

/** 연속을 잇는 날인가 — "3장만"(`touched`) 문턱이다. `sessionLimit` 설정과 무관하다 */
function counts(r: DayRecord | undefined): boolean {
  return r !== undefined && r.tier !== 'none'
}

export function buildStreak(
  attendance: ReadonlyMap<string, DayRecord>,
  todayKey: string,
): StreakRecord {
  const days = [...attendance.values()]
    .filter((r) => counts(r) && r.date <= todayKey)
    .map((r) => r.date)
    .sort()

  let longest = 0
  let run = 0
  let prev: string | null = null
  const milestones: Milestone[] = []
  for (const date of days) {
    run = prev !== null && shiftDateKey(prev, 1) === date ? run + 1 : 1
    prev = date
    if (run > longest) longest = run
    const hit = STREAK_MILESTONES.find((m) => m === run)
    if (hit) milestones.push({ id: `streak${hit}:${date}`, days: hit, date })
  }

  const todayDone = counts(attendance.get(todayKey))
  const lastLive = todayDone ? todayKey : shiftDateKey(todayKey, -1)
  const current = prev === lastLive ? run : 0

  return { current, todayDone, longest, milestones }
}

/** 이정표 이름 — "1주 연속" */
export function milestoneLabel(days: number): string {
  return `${days / 7}주 연속`
}

/** `current` 다음으로 닿을 이정표. 사다리 끝을 넘었으면 null */
export function nextMilestone(current: number): (typeof STREAK_MILESTONES)[number] | null {
  return STREAK_MILESTONES.find((m) => m > current) ?? null
}
