// 리포트 달력을 펼쳐 뒀는지 기억한다 (2026-10-01 사용자 제안 「달력을 접고 문구를 우선, 토글로」).
//
// 이벤트 로그가 아니다 — 화면 보기 설정이라 스키마를 안 건드린다 (welcome.ts 와 같은 관례).
// 기기마다 따로다. 읽기가 막히면 접힌 기본값으로 돌아간다 — 그래도 화면은 깨지지 않는다
const KEY = 'yomenai:calendarOpen'

export function isCalendarOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setCalendarOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    // 저장 실패면 다음 진입에서 접힌 채로 시작한다
  }
}
