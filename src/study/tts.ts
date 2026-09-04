// 확인 단계에서 정답 읽기를 소리로 들려준다. Web Speech API 우선, 엔진은 Tts 인터페이스 뒤에 둔다 (PLAN §6)

export interface Tts {
  /** 이 환경에서 음성 재생이 가능한지. false 면 화면이 버튼을 숨긴다 */
  readonly available: boolean
  /** 히라가나 읽기를 일본어로 읽어 준다. 빈 문자열은 무시 */
  speak(text: string): void
  cancel(): void
}

const NOOP_TTS: Tts = { available: false, speak() {}, cancel() {} }

interface SpeechLike {
  getVoices(): SpeechSynthesisVoice[]
  speak(u: SpeechSynthesisUtterance): void
  cancel(): void
  addEventListener(type: 'voiceschanged', cb: () => void): void
}

/**
 * 의존성을 주입받는다 — 테스트가 가짜 엔진을 넣을 수 있게. 기본값은 브라우저 전역.
 * node(테스트) 에서는 전역이 없어 자동으로 no-op 이 된다.
 */
export function createWebSpeechTts(
  synth: SpeechLike | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis,
  Utterance: typeof SpeechSynthesisUtterance | undefined =
    typeof SpeechSynthesisUtterance === 'undefined' ? undefined : SpeechSynthesisUtterance,
): Tts {
  if (!synth || !Utterance) return NOOP_TTS

  // ja-JP 음성은 비동기로 채워진다 (voiceschanged). 없으면 lang 만 주고 엔진 판단에 맡긴다.
  let jaVoice: SpeechSynthesisVoice | null = null
  const pickVoice = () => {
    jaVoice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ja')) ?? null
  }
  pickVoice()
  synth.addEventListener('voiceschanged', pickVoice)

  return {
    available: true,
    speak(text: string) {
      const t = text.trim()
      if (t === '') return
      synth.cancel() // 이전 발화 중단 — 카드가 빠르게 넘어가도 겹치지 않는다
      const u = new Utterance(t)
      u.lang = 'ja-JP'
      if (jaVoice) u.voice = jaVoice
      u.rate = 0.9 // 학습용으로 살짝 느리게
      synth.speak(u)
    },
    cancel() {
      synth.cancel()
    },
  }
}

/** 앱 전역 인스턴스 */
export const tts: Tts = createWebSpeechTts()
