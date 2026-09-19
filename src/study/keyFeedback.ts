// 자판 입력 피드백 — 소리와 진동 (2026-09-19 사용자 요청).
//
// 시스템 키보드를 안 쓰니 iOS·안드로이드가 주던 키 클릭음·햅틱도 같이 사라졌다. 앱이 대신 낸다.
//
// **진동은 iOS 에서 안 된다.** WebKit 에 공개 진동 API 가 없다. `<input type="checkbox" switch>`
// 의 부작용으로 햅틱을 부르는 우회가 iOS 17.4~26.4 에서 돌았지만 26.5 에서 애플이 막았다.
// 그래서 지원 여부를 물어보고, 안 되는 기기에서는 설정에서 고를 수 없게 한다.
//
// **소리는 무음 스위치에 묶인다** (iOS). Web Audio 가 벨소리 채널을 타서, 측면 무음이면 안 난다 —
// 소리 듣기(TTS)와 같은 제약이다.

/** 이 기기가 진동을 낼 수 있나. iOS 는 항상 false */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

let ctx: AudioContext | null = null

/**
 * 짧은 클릭음. 파일을 안 쓰고 합성한다 — 자산 하나를 더 받게 할 값이 없고, 캐시·오프라인
 * 신경 쓸 일도 없다. 키를 누르는 제스처 안에서 만들어야 iOS 가 오디오를 열어 준다
 */
export function playKeyClick(): void {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 1180
    // 12ms 안에 꺼진다. 더 길면 연타할 때 소리가 겹쳐 지저분해진다
    gain.gain.setValueAtTime(0.06, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012)
    osc.connect(gain).connect(ctx.destination)
    osc.start(now)
    osc.stop(now + 0.014)
  } catch {
    // 오디오를 못 열면 조용히 넘어간다 — 입력 자체를 막을 이유가 없다
  }
}

/** 아주 짧은 진동. 길면 연타에서 끊기지 않고 붕 떠 있는 느낌이 된다 */
export function vibrateKey(): void {
  try {
    navigator.vibrate?.(8)
  } catch {
    // 지원 안 하거나 사용자 제스처 밖 — 무시
  }
}
