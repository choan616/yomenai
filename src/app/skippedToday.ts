// 오늘 넘긴(SKIP) 표기 — 미끼가 그 글자를 다시 안 내밀게 기기에 기억한다 (2026-10-13)
//
// **넘김은 이벤트를 안 남긴다** (2026-09-14 — 빈 답이 오답 유형 분류기를 거치면 밴드 판정과
// 처방이 오염된다). 그래서 「오늘 본 표기」를 학습 기록만으로는 알 수 없고, 넘긴 표기는
// 미끼에 다시 선다 (사용자 지적). 스키마를 건드리지 않고 기기 값으로 둔다 —
// `leadHint`·`welcomeSeen` 과 같은 자리이고, 미끼는 화면 장치라 기기마다 달라도 자료가 안 갈린다.
//
// 날짜가 바뀌면 통째로 버린다. 어제 넘긴 표기는 오늘 다시 내밀어도 된다.
import { bumpDataVersion } from '../core/dataVersion.ts'

const KEY = 'yomenai:skippedToday'

interface Stored {
  day: string
  words: string[]
}

/** 오늘 넘긴 표기. 저장된 날이 오늘이 아니면 빈 집합이다 */
export function loadSkipped(day: string): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return new Set()
    const v = JSON.parse(raw) as Stored
    return v.day === day && Array.isArray(v.words) ? new Set(v.words) : new Set()
  } catch {
    // 프라이빗 모드이거나 값이 깨졌다 — 못 거르는 것뿐이라 조용히 비운다
    return new Set()
  }
}

export function addSkipped(day: string, headword: string): void {
  try {
    const words = loadSkipped(day)
    if (words.has(headword)) return
    words.add(headword)
    localStorage.setItem(KEY, JSON.stringify({ day, words: [...words] } satisfies Stored))
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
  // **홈 캐시를 버린다.** 넘김은 이벤트를 안 남겨 데이터 버전이 안 오르고, 그러면 세션에서
  // 돌아온 홈이 넘기기 전에 계산한 미리보기를 그대로 다시 쓴다 — 넘긴 표기가 그대로 선다.
  // 설정 저장이 같은 이유로 버전을 올린다 (`settings.ts`)
  bumpDataVersion()
}
