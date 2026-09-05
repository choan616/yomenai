// 동기화 UI 상태 — 로그인 유지 여부와 마지막 동기화 시각을 localStorage 에 보관한다.
// 사용자 DB(IndexedDB)와 무관한 UI 환경설정이라 settings.ts / theme.ts 와 같은 자리에 둔다

const SIGNED_IN_KEY = 'yomenai:sync:signedIn'
const LAST_SYNC_KEY = 'yomenai:sync:lastAt'

/** 이전에 로그인에 성공했는지 — 앱을 다시 열었을 때 조용히 세션 복원을 시도할지 판단 */
export function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === '1'
  } catch {
    return false
  }
}

export function setSignedIn(signedIn: boolean): void {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_KEY, '1')
    else localStorage.removeItem(SIGNED_IN_KEY)
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 세션 한정
  }
}

export function getLastSyncAt(): number | null {
  try {
    const raw = localStorage.getItem(LAST_SYNC_KEY)
    const n = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

export function setLastSyncAt(at: number): void {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(at))
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 세션 한정
  }
}
