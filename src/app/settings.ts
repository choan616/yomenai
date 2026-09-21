// 세션 길이·모드 비율·관찰 문구 노출을 localStorage 에 보관한다. 사전 DB·IndexedDB 와 무관한 UI 환경설정
import { bumpDataVersion } from '../core/dataVersion.ts'
export type ObserveLevel = 'off' | 'normal' | 'often'
/** 자판 입력 피드백 (2026-09-19). 시스템 키보드를 안 쓰니 키 클릭음·햅틱을 앱이 낸다 */
export type KeyFeedback = 'off' | 'sound' | 'haptic'
/** 로마자 자판 배열 (2026-09-20). 근거는 keypadLayouts.ts */
export type KeypadLayout = 'qwerty' | 'compact'

export interface Settings {
  sessionLimit: number
  /** selectSession 의 ratio 옵션으로 그대로 전달된다 (PLAN §6 기본 7:3) */
  ratio: { correction: number; expansion: number }
  /** 루프 안 관찰 문구 노출 빈도 (Phase 9-C). normal 이 권장 기본값 */
  observeLevel: ObserveLevel
  /** 기본은 끔 — 소리는 무음 스위치에, 진동은 기기 지원에 걸려 예측이 어렵다 */
  keyFeedback: KeyFeedback
  keypadLayout: KeypadLayout
  /**
   * 다시보기에서 요미가나를 가려 두고 눌러서 확인한다 (2026-09-21 사용자 요청).
   * 기본은 가림 — 읽기가 보이는 채로 넘기면 「아는 것 같은 느낌」만 남는다
   */
  browseMask: boolean
}

export const LIMIT_MIN = 5
export const LIMIT_MAX = 40

export const DEFAULT_SETTINGS: Settings = {
  sessionLimit: 20,
  ratio: { correction: 7, expansion: 3 },
  observeLevel: 'normal',
  keyFeedback: 'off',
  keypadLayout: 'qwerty',
  browseMask: true,
}

/** observeLevel 별 게이트 — [최소 카드 간격, 세션당 상한] */
export const OBSERVE_GATE: Record<ObserveLevel, { gap: number; cap: number }> = {
  off: { gap: Infinity, cap: 0 },
  normal: { gap: 6, cap: 4 },
  often: { gap: 3, cap: 8 },
}

const KEY = 'yomenai:settings'

/** 저장된 raw 를 안전하게 Settings 로. 범위를 벗어나면 클램프하고, 깨진 값은 기본값으로 */
export function parseSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null)
    return { ...DEFAULT_SETTINGS, ratio: { ...DEFAULT_SETTINGS.ratio } }
  const r = raw as Record<string, unknown>
  const limit = Number(r.sessionLimit)
  const ratioRaw = (typeof r.ratio === 'object' && r.ratio !== null ? r.ratio : {}) as Record<string, unknown>
  const corr = Number(ratioRaw.correction)
  const exp = Number(ratioRaw.expansion)
  const ratioOk = Number.isFinite(corr) && Number.isFinite(exp) && corr >= 0 && exp >= 0 && corr + exp > 0
  const lvl = r.observeLevel
  const kf = r.keyFeedback
  const kl = r.keypadLayout
  const bm = r.browseMask
  return {
    sessionLimit: Number.isFinite(limit)
      ? Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, Math.round(limit)))
      : DEFAULT_SETTINGS.sessionLimit,
    ratio: ratioOk
      ? { correction: Math.round(corr), expansion: Math.round(exp) }
      : { ...DEFAULT_SETTINGS.ratio },
    observeLevel: lvl === 'off' || lvl === 'often' ? lvl : DEFAULT_SETTINGS.observeLevel,
    keyFeedback: kf === 'sound' || kf === 'haptic' ? kf : DEFAULT_SETTINGS.keyFeedback,
    keypadLayout: kl === 'compact' ? kl : DEFAULT_SETTINGS.keypadLayout,
    // 저장된 적 없으면(undefined) 기본값이다 — false 만 명시적인 끔으로 받는다
    browseMask: bm === false ? false : DEFAULT_SETTINGS.browseMask,
  }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    return raw === null ? parseSettings(null) : parseSettings(JSON.parse(raw))
  } catch {
    return parseSettings(null)
  }
}

export function saveSettings(s: Settings): void {
  // 홈 미리보기가 sessionLimit·ratio 로 달라진다 — 캐시를 버리게 버전을 올린다
  bumpDataVersion()
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // 프라이빗 모드 등 저장 불가 — 세션 한정으로 진행한다
  }
}

/**
 * "3장만" 세션의 길이. `sessionLimit`(LIMIT_MIN 5) 아래라 설정으로는 못 만드는 값이고,
 * 그게 의도다 — 기본 리듬은 그대로 두고 **의욕 없는 날의 진입로**만 따로 낸다.
 * 9-B 가 진단에 쓴 논리(한 번의 약속 단위를 줄인다)를 세션에 적용한 것 (Phase 11).
 */
export const QUICK_SESSION_LIMIT = 3
