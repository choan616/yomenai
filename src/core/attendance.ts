// 하루 단위 참여 등급 — 매일 학습 달력의 데이터 층 (2026-09-29, 사용자 제안)
//
// 포인트·배지·스트릭은 기각했다(2026-09-06/07 절 — 손실 회피가 의욕 없는 날 죄책감으로
// 번지고, 한 번 끊기면 완전 이탈로 간다). 이 달력은 그 손실 회피 자체는 남기되(빈 칸이
// "쉰 날"로 보이는 것 자체가 자극이라는 사용자 판단) **문턱을 낮춰** 무디게 만든다 —
// "3장만"(QUICK_SESSION_LIMIT)만 채워도 구멍이 안 생긴다. 기준 세션(`sessionLimit`)을
// 넘긴 날은 `full`로 갈라 "많이 한 날"을 따로 보여준다 — 처벌 한 축에 보상 한 축을 더한다.
//
// 문턱을 인자로 받는 이유 — core 는 app 층(`settings.ts`)을 모른다 (기존 관례, 다른
// core 파일 어디도 `../app`을 안 부른다). 호출부(Report.tsx)가 QUICK_SESSION_LIMIT과
// 사용자 설정의 sessionLimit을 읽어 넘긴다.
import type { LearningEvent } from './types.ts'

export type DayTier = 'none' | 'touched' | 'full'

export interface DayRecord {
  /** 로컬 자정 기준 YYYY-MM-DD */
  date: string
  /** 그 날의 채점 수 (읽기·뜻 카드 합) */
  count: number
  tier: DayTier
}

export interface AttendanceThresholds {
  /** 이 문턱 미만이면 구멍(`none`)이다 */
  quick: number
  /** 이 문턱 이상이면 `full`(기준 세션을 넘긴 날)이다 */
  full: number
}

/** epoch ms를 기기 로컬 자정 기준 날짜 키로. 이벤트 `at`도 이 키도 같은 기준(로컬)이라야 갈린다 */
function localDateKey(at: number): string {
  const d = new Date(at)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function tierOf(count: number, t: AttendanceThresholds): DayTier {
  if (count < t.quick) return 'none'
  return count >= t.full ? 'full' : 'touched'
}

/**
 * 전체 이벤트 로그에서 하루 단위 채점 수를 접는다.
 *
 * 기록이 없는 날은 맵에 안 들어간다 — 호출부가 그 부재를 `none`으로 읽는다
 * (`calendarGrid` 참고). append-only 로그라 언제든 다시 세면 되므로 따로 저장하지 않는다
 * (`buildLevel`과 같은 원칙, PLAN §5).
 */
export function buildAttendance(
  events: readonly LearningEvent[],
  thresholds: AttendanceThresholds,
): Map<string, DayRecord> {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'review' || e.deletedAt !== null) continue
    const key = localDateKey(e.at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out = new Map<string, DayRecord>()
  for (const [date, count] of counts) {
    out.set(date, { date, count, tier: tierOf(count, thresholds) })
  }
  return out
}

/** 격자에 보여줄 주 수 */
export const CALENDAR_WEEKS = 4

export type GridDayState = DayTier | 'future'

export interface GridDay {
  date: string
  /** 1~31 */
  day: number
  state: GridDayState
}

/**
 * 오늘이 속한 주의 토요일까지, 최근 `CALENDAR_WEEKS`주를 꽉 채운 격자를 만든다.
 *
 * 월 경계(1일 시작)로 자르는 안은 안 썼다 — 월초엔 대부분 빈 칸이라 달력이 늘 허전해
 * 보인다. 오늘이 속한 주까지 롤링해서 언제 열어도 최근 4주가 꽉 차 있게 한다.
 *
 * 오늘 이후 날짜는 `future`로 갈라 `none`(쉰 날)과 다르게 표시한다 — 안 그러면 이번 주
 * 나머지 요일이 전부 "구멍"으로 보여, 아직 오지도 않은 날을 쉰 것처럼 말하게 된다.
 */
export function calendarGrid(
  today: Date,
  attendance: ReadonlyMap<string, DayRecord>,
): GridDay[][] {
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const todayKey = localDateKey(midnight.getTime())

  const end = new Date(midnight)
  end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end)
  start.setDate(start.getDate() - (CALENDAR_WEEKS * 7 - 1))

  const days: GridDay[] = []
  const cursor = new Date(start)
  while (cursor <= end) {
    const key = localDateKey(cursor.getTime())
    const rec = attendance.get(key)
    days.push({
      date: key,
      day: cursor.getDate(),
      state: key > todayKey ? 'future' : (rec?.tier ?? 'none'),
    })
    cursor.setDate(cursor.getDate() + 1)
  }

  const weeks: GridDay[][] = []
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
  return weeks
}
