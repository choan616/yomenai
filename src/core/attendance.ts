// 하루 단위 참여 등급 — 매일 학습 달력의 데이터 층 (2026-09-29, 사용자 제안)
//
// 포인트·배지·스트릭은 기각했다(2026-09-06/07 절 — 손실 회피가 의욕 없는 날 죄책감으로
// 번지고, 한 번 끊기면 완전 이탈로 간다). 이 달력은 그 손실 회피 자체는 남기되(빈 칸이
// "쉰 날"로 보이는 것 자체가 자극이라는 사용자 판단) **문턱을 낮춰** 무디게 만든다 —
// "3장만"(QUICK_SESSION_LIMIT)만 채워도 구멍이 안 생긴다. 기준 세션(`sessionLimit`)을
// 넘긴 날은 `full`로 갈라 "많이 한 날"을 따로 보여준다 — 처벌 한 축에 보상 한 축을 더한다.
//
// 세 등급(`none`/`touched`/`full`) 판정은 여기서 끝난다. 이걸 색으로 보여줄지 명도로
// 보여줄지는 UI(Report.tsx) 몫이다 — 등급 판정 자체는 표현 방식과 무관해서 core 에는
// 안 새긴다. (참고: 화면 쪽 그 판단은 2026-09-29 안에 색 쪽으로 뒤집혔다 — "정답에 색을
// 주면 정답도 이벤트가 된다"는 PLAN §7 원칙에 대한 사용자의 명시적 예외 지시다)
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
export function dateKey(at: number): string {
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
 * (`monthGrid` 참고). append-only 로그라 언제든 다시 세면 되므로 따로 저장하지 않는다
 * (`buildLevel`과 같은 원칙, PLAN §5).
 */
export function buildAttendance(
  events: readonly LearningEvent[],
  thresholds: AttendanceThresholds,
): Map<string, DayRecord> {
  const counts = new Map<string, number>()
  for (const e of events) {
    if (e.type !== 'review' || e.deletedAt !== null) continue
    const key = dateKey(e.at)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const out = new Map<string, DayRecord>()
  for (const [date, count] of counts) {
    out.set(date, { date, count, tier: tierOf(count, thresholds) })
  }
  return out
}

export interface MonthCell {
  date: string
  /** 1~31 */
  day: number
  tier: DayTier
}

/**
 * 진짜 월 달력 격자를 만든다 (2026-09-29, 사용자가 "롤링 4주"보다 "월 달력이 자극이
 * 더 클 것 같다"고 판단해 교체). `month`는 1~12.
 *
 * 달 밖 칸은 `null` — 참고 이미지(사용자 제공)가 그 칸을 완전히 비워 두는 방식을
 * 그대로 따른다. 미래 날짜를 따로 가를 필요가 없다 — 채점 이벤트가 없으니 `attendance`
 * 맵에 없고, 그러면 `tier`가 자연히 `none`이 된다. 달력 UI(Report.tsx)가 "다음 달"
 * 버튼을 이번 달까지만 열어 두면 텅 빈 미래 달을 보여줄 일 자체가 없다.
 */
export function monthGrid(
  year: number,
  month: number,
  attendance: ReadonlyMap<string, DayRecord>,
): (MonthCell | null)[][] {
  const first = new Date(year, month - 1, 1)
  const daysInMonth = new Date(year, month, 0).getDate()
  const leading = first.getDay()

  const cells: (MonthCell | null)[] = Array.from({ length: leading }, () => null)
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dateKey(new Date(year, month - 1, day).getTime())
    cells.push({ date: key, day, tier: attendance.get(key)?.tier ?? 'none' })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: (MonthCell | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}
