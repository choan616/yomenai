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
/**
   * 세션에서 훈독 숙어(浜辺 はまべ·荒木 あらき)가 차지할 몫. **0~100 퍼센트**
   * (2026-09-22 사용자 요청 — 켜고 끄기가 아니라 레인지).
   *
   * 0 이면 안 낸다, 100 이면 훈독만 낸다. 기본은 0 이다 — 이 앱의 오답 분류·음독 맵·
   * 형제 대조가 전부 음독 전제라 훈독에는 안 붙는다. 다만 연탁·촉음은 훈독에도 그대로
   * 걸리므로(羽子板 は**ご**いた) 원하면 올릴 수 있게 둔다.
   *
   * **후보 풀에 섞는 방식으로는 이 비율이 안 나온다** — 훈독은 음독 쌍이 없어
   * 미숙 음독 가중이 바닥이라 늘 줄 맨 뒤로 밀린다(풀 8.9% → 출제 1%, 200장 실측).
   * 그래서 `selectSession` 이 **정원으로 떼어낸다** (`kunShare`).
   *
   * 0 보다 크면 코퍼스 범위 자체가 넓어진다 — 출제 풀·홈 미리보기·진입 진단·밴드 사다리가
   * 모두 같은 범위를 본다. 「공부는 하는데 사다리에는 안 잡히는 것」을 만들지 않으려는 것이다
   */
  kunPercent: number
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
  kunPercent: 0,
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
  const kp = Number(r.kunPercent)
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
    // 0~100 으로 자르고 10 단위로 맞춘다 — 레인지의 눈금과 같게 (깨진 값은 0)
    kunPercent: Number.isFinite(kp) ? Math.min(100, Math.max(0, Math.round(kp / 10) * 10)) : 0,
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
  // 홈 미리보기가 sessionLimit·ratio·kunPercent 로 달라진다 — 캐시를 버리게 버전을 올린다
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
