// 「오늘은 짧게」 토스트의 표시 판정 — 하루가 다 지나가는데 학습이 없으면 홈에서 한 번 권한다
//
// 2026-10-02 사용자 지시 「하루가 다 지나도록 학습이 이뤄지지 않으면 토스트 메시지 같은 것으로
// 짧은 세션을 유도」. 리포트 달력의 오늘 칸 유도(`.cal-nudge`)는 **찾아온 사람**에게만 닿으므로,
// 앱을 열었지만 그냥 닫는 날을 받치는 자리다.
//
// **이벤트 로그가 아니다** — 그날 띄웠는지는 화면 진행 상태라 스키마를 안 건드린다
// (`welcome.ts`·`calendarOpen.ts` 와 같은 관례). 기기마다 따로다.
//
// 재촉은 죄책감으로 번지기 쉽다(스트릭 기각 2026-09-06/07). 그래서 선을 긋는다 —
// **앱 안 토스트만**(푸시 알림은 범위 밖), 긍정 문구만, 하루 한 번, 한 번 닫으면 그날은 끝.

/**
 * 이 시각(로컬)이 지나야 권한다. 「하루가 다 지나도록」을 판정하는 시점이고
 * 사용자가 22시로 정했다 (2026-10-02). 자정까지 3장을 할 여유는 남는다.
 * 설정으로는 안 받는다 — 토스트를 써 보고 정하기로 했다 (checklist)
 */
export const NUDGE_HOUR = 22

/** 스스로 사라지는 시간. 닫기를 누르면 그보다 먼저 사라진다 */
export const NUDGE_DISMISS_MS = 8000

const KEY = 'yomenai:nudgeShown'

/** 마지막으로 띄운 날 (YYYY-MM-DD). 읽기가 막히면 안 띄운 것으로 본다 */
function shownOn(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function markNudgeShown(day: string): void {
  try {
    localStorage.setItem(KEY, day)
  } catch {
    /* 프라이빗 모드 — 이번 진입에만 유효하다. 호출부가 한 번만 띄우는 건 따로 막는다 */
  }
}

/**
 * 지금 권해도 되나. 세 조건을 다 넘어야 한다 —
 * 오늘 칸이 아직 비었고(`todayDone` 이 거짓), 문턱 시각이 지났고, 오늘 아직 안 띄웠다.
 *
 * 앱을 켜 둔 채 문턱을 넘는 경우는 **안 다룬다** — 홈에 들어온 시점에만 본다.
 * 타이머를 두면 자정 넘김과 백그라운드 복귀까지 따라붙는다 (context-notes 2026-10-02)
 */
export function shouldNudge(todayDone: boolean, day: string, now: number): boolean {
  if (todayDone) return false
  if (new Date(now).getHours() < NUDGE_HOUR) return false
  return shownOn() !== day
}
