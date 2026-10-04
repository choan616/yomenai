// 한자 끝말잇기의 기록 — 최고 연결 수와 판 수를 기기에 남긴다 (2026-10-04 사용자 「기록할 만한 끝말잇기 기록은 어딘가에 표시해줘」)
//
// **학습 이벤트 로그가 아니다.** 놀이 결과가 밴드 사다리·복습 주기에 섞이지 않게 로그에 안 넣기로 했다(context-notes 2026-10-04).
// 그래서 스키마를 안 건드리는 기기 값(localStorage)이다 — `ttsPrefs.ts`·`nudgeToast.ts` 와 같은 관례. 대가: 백업에 안 실리고 기기마다 따로다.

export interface ShiritoriRecord {
  /** 한 판에서 내가 이은 말의 최고 개수 */
  best: number
  /** 끝낸 판 수 (한 개라도 이은 판만) */
  plays: number
}

export interface GameResult extends ShiritoriRecord {
  /** 이번 판이 이전 최고를 넘었나 (첫 판의 첫 기록도 새 기록이다) */
  isNewBest: boolean
}

const KEY = 'yomenai:shiritori'
const EMPTY: ShiritoriRecord = { best: 0, plays: 0 }

export function loadShiritoriRecord(): ShiritoriRecord {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return { ...EMPTY }
    const r = JSON.parse(raw) as Record<string, unknown>
    const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
    return { best: n(r.best), plays: n(r.plays) }
  } catch {
    // 읽기가 막히거나 값이 깨졌으면 기록 없음 — 놀이는 계속된다
    return { ...EMPTY }
  }
}

/** 한 판이 끝났을 때 부른다. 한 개도 못 이은 판은 판으로 안 센다 */
export function recordGame(count: number): GameResult {
  const prev = loadShiritoriRecord()
  if (count <= 0) return { ...prev, isNewBest: false }
  const next: ShiritoriRecord = { best: Math.max(prev.best, count), plays: prev.plays + 1 }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
  return { ...next, isNewBest: count > prev.best }
}
