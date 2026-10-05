// 시작 인트로를 어떤 판으로 보일지 — 하루 첫 실행은 전체판, 같은 날 다시 열면 빠른 판 (2026-10-05, context-notes 같은 날 절)
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

export type IntroMode = 'full' | 'quick'

/**
 * 이번 실행에 어떤 인트로를 보일지 (2026-10-05 사용자 「중간안으로」): 하루 첫 실행은 **전체판**(약 5.6초),
 * 같은 날 다시 열면 **빠른 판**(약 1.7초). 안 보이면 null.
 *
 * 모션을 줄인 기기에서는 안 보인다. 저장소가 막혀 있으면(프라이빗 모드) **안 보인다** — 기억을 못 하면 열 때마다 전체판이
 * 뜨는데, 매번 보이는 5초 인트로는 짜증이다. 시스템 가이드도 자주 보이는 시작 연출은 짧게 두라고 한다.
 */
export function introMode(day: string, opts: { reducedMotion: boolean; dev: boolean }): IntroMode | null {
  if (opts.reducedMotion) return null
  if (opts.dev) {
    try {
      if (localStorage.getItem('yomenai:intro') !== '1') return null
    } catch {
      return null
    }
  }
  try {
    localStorage.setItem('yomenai:__probe', '1')
    localStorage.removeItem('yomenai:__probe')
  } catch {
    return null
  }
  return shownDay() === day ? 'quick' : 'full'
}

export function markIntroShown(day: string): void {
  try {
    localStorage.setItem(KEY, day)
  } catch {
    /* 프라이빗 모드 — introMode 가 이미 막는다 */
  }
}
