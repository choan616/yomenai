// 시작 인트로를 보일 때인지 — 하루에 첫 실행 때 한 번 (2026-10-05 사용자 「시작화면 앞에 인트로」, context-notes 같은 날 절)
//
// **이벤트 로그가 아니다** — 화면 진행 상태라 스키마를 안 건드린다(`welcome.ts`·`nudgeToast.ts` 와 같은 관례). 기기마다 따로다.
// 개발 빌드에서는 꺼 둔다: e2e 가 시작 화면을 바로 만지는데 인트로가 몇 초 가로막으면 모든 스펙이 흔들린다.
// 개발 빌드에서 시험하려면 `localStorage['yomenai:intro'] = '1'` 로 켠다(프로덕션 빌드에서는 이 분기가 사라진다).

const KEY = 'yomenai:introDay'

/** 마지막으로 인트로를 보인 날 (YYYY-MM-DD). 읽기가 막히면 null */
function shownDay(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/**
 * 오늘 인트로를 보일 차례인가. 모션을 줄인 기기에서는 안 보인다.
 * 저장소가 막혀 있으면(프라이빗 모드) **보이지 않는다** — 기억을 못 하면 열 때마다 보이게 되는데, 매번 보이는 인트로는 짜증이다.
 */
export function introDue(day: string, opts: { reducedMotion: boolean; dev: boolean }): boolean {
  if (opts.reducedMotion) return false
  if (opts.dev) {
    try {
      if (localStorage.getItem('yomenai:intro') !== '1') return false
    } catch {
      return false
    }
  }
  try {
    localStorage.setItem('yomenai:__probe', '1')
    localStorage.removeItem('yomenai:__probe')
  } catch {
    return false
  }
  return shownDay() !== day
}

export function markIntroShown(day: string): void {
  try {
    localStorage.setItem(KEY, day)
  } catch {
    /* 프라이빗 모드 — introDue 가 이미 막는다 */
  }
}
