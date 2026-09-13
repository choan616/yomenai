// 이미 소개한 숙어 — 새 단어의 첫 만남을 시험이 아니라 소개로 바꾸는 데 쓴다 (2026-09-13)
//
// **이벤트 로그가 아니라 localStorage 에 둔다.** 이건 학습 기록이 아니라 화면 진행 상태다.
// 이벤트로 올리면 스키마 불변 조건(CLAUDE.md)을 건드려야 하고, 재생·통계에도 끼어든다.
// 기기 간 동기화가 안 되는 건 알고 받는 값이다 — 다른 기기에서 새 단어를 한 번 더 보는 건
// 손해가 아니다 (context-notes 2026-09-13).
const KEY = 'yomenai:introduced'

function read(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return new Set()
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set()
  } catch {
    // 프라이빗 모드·깨진 값 — 못 읽으면 아직 아무것도 안 소개한 것으로 본다
    return new Set()
  }
}

/** 소개한 숙어 id 집합. 호출부는 세션을 짤 때 한 번만 읽는다 */
export function loadIntroduced(): Set<string> {
  return read()
}

/** 하나를 소개 완료로 적는다. 저장이 막혀 있으면 조용히 넘긴다 (다음에 한 번 더 볼 뿐이다) */
export function markIntroduced(idiomId: string): void {
  try {
    const set = read()
    set.add(idiomId)
    localStorage.setItem(KEY, JSON.stringify([...set]))
  } catch {
    /* 저장 불가 — 기능이 없을 뿐 흐름은 그대로 */
  }
}

/** 학습 기록 초기화가 부를 자리. 소개 이력도 같이 비운다 */
export function clearIntroduced(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* 무시 */
  }
}
