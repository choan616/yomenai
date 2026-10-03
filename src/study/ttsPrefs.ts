// 소리(TTS) 취향 — 음성과 속도를 기기별로 기억한다 (2026-10-03 사용자 지적 「tts가 너무 딱딱해서」)
//
// **설정(`settings.ts`)이 아니라 기기 값이다.** `settings.ts` 의 저장은 데이터 버전을 올려 홈·리포트
// 캐시를 버린다 — 소리 취향이 그 값을 날릴 이유가 없다(`wordlistView.ts` 를 따로 둔 이유와 같다).
// 음성 이름은 기기·브라우저마다 달라 동기화할 값도 아니다. 이벤트가 아니라 스키마는 안 건드린다.
export type TtsRate = 'slow' | 'normal' | 'fast'

/** 단계 → `SpeechSynthesisUtterance.rate`. 기본(normal)은 예전 고정값 0.9 와 같다 */
export const RATE_VALUE: Record<TtsRate, number> = { slow: 0.75, normal: 0.9, fast: 1.05 }
export const RATE_LABEL: Record<TtsRate, string> = { slow: '느리게', normal: '보통', fast: '빠르게' }
export const RATES: TtsRate[] = ['slow', 'normal', 'fast']

export interface TtsPrefs {
  /** 고른 음성의 이름. 빈 문자열이면 자동 — 가장 자연스러운 음성을 알아서 고른다 */
  voice: string
  rate: TtsRate
}

const KEY = 'yomenai:tts'
const DEFAULTS: TtsPrefs = { voice: '', rate: 'normal' }

export function loadTtsPrefs(): TtsPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw === null) return { ...DEFAULTS }
    const r = JSON.parse(raw) as Record<string, unknown>
    return {
      voice: typeof r.voice === 'string' ? r.voice : DEFAULTS.voice,
      rate: RATES.includes(r.rate as TtsRate) ? (r.rate as TtsRate) : DEFAULTS.rate,
    }
  } catch {
    // 읽기가 막히거나 값이 깨졌으면 기본값 — 소리는 나야 한다
    return { ...DEFAULTS }
  }
}

export function saveTtsPrefs(p: TtsPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p))
  } catch {
    /* 프라이빗 모드 — 이번 세션만 */
  }
}
