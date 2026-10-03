// 확인 단계에서 정답 읽기를 소리로 들려준다. Web Speech API 우선, 엔진은 Tts 인터페이스 뒤에 둔다 (PLAN §6)
import { loadTtsPrefs, RATE_VALUE, type TtsPrefs } from './ttsPrefs.ts'

/** 설정 화면이 고르게 보여 주는 음성 한 개 */
export interface TtsVoice {
  /** 브라우저가 부르는 이름 — 저장하는 값이다. 기기마다 다르다 */
  name: string
  /** 화면용 이름 (`Microsoft Nanami Online (Natural) - Japanese (Japan)` → `Nanami Online (Natural)`) */
  label: string
  /** 네트워크가 있어야 나는 음성 */
  online: boolean
}

export interface Tts {
  /** 이 환경에서 음성 재생이 가능한지. false 면 화면이 버튼을 숨긴다 */
  readonly available: boolean
  /** 히라가나 읽기를 일본어로 읽어 준다. 빈 문자열은 무시 */
  speak(text: string): void
  cancel(): void
  /** 이 기기의 일본어 음성, 자연스러울 것 같은 순서대로. 아직 안 채워졌으면 빈 배열 */
  voices(): TtsVoice[]
  /** 음성 목록이 (비동기로) 채워지거나 바뀔 때 부른다. 돌려주는 함수가 구독 해제다 */
  onVoicesChanged(cb: () => void): () => void
}

const NOOP_TTS: Tts = {
  available: false,
  speak() {},
  cancel() {},
  voices: () => [],
  onVoicesChanged: () => () => {},
}

interface SpeechLike {
  getVoices(): SpeechSynthesisVoice[]
  speak(u: SpeechSynthesisUtterance): void
  cancel(): void
  addEventListener(type: 'voiceschanged', cb: () => void): void
  removeEventListener?(type: 'voiceschanged', cb: () => void): void
}

/**
 * 음성이 얼마나 자연스러울 것 같은가 — 이름에서 읽는 어림이다.
 *
 * 소리는 코드가 못 듣는다. 그래서 브라우저·OS 가 이름에 남기는 표지를 쓴다. 신경망 음성은 이름에
 * `Natural`·`Neural`, 애플의 고품질판은 `Enhanced`·`Premium`·`Siri`, 크롬의 네트워크 음성은 `Google` 이
 * 든다. 네트워크 음성(`localService === false`)은 로컬 구형 합성기보다 대체로 자연스럽다.
 * 구형 데스크톱 합성기(`... Desktop`)는 뒤로 민다.
 *
 * 어림이 틀릴 수 있어서 설정에서 직접 고를 수 있게 했다 (`ttsPrefs.ts`).
 */
export function voiceScore(v: { name?: string; localService?: boolean }): number {
  const name = v.name ?? ''
  let s = 0
  if (/natural|neural/i.test(name)) s += 100
  if (/enhanced|premium|siri/i.test(name)) s += 60
  if (/google/i.test(name)) s += 50
  if (/online/i.test(name)) s += 40
  if (v.localService === false) s += 30
  if (/desktop/i.test(name)) s -= 10
  return s
}

/**
 * 일본어 음성을 자연스러울 것 같은 순으로. 점수가 같으면 브라우저가 준 순서를 지킨다.
 *
 * **오프라인이면 네트워크 음성을 뺀다** — 이 앱은 PWA 라 오프라인으로도 쓰는데, 네트워크 음성은 연결이 없으면
 * 소리 없이 실패한다. 로컬 음성이 하나도 없으면 그대로 둔다(빼면 소리 자체가 사라진다).
 */
export function rankJapaneseVoices(
  voices: readonly SpeechSynthesisVoice[],
  online: boolean,
): SpeechSynthesisVoice[] {
  const ja = voices.filter((v) => (v.lang ?? '').toLowerCase().startsWith('ja'))
  const usable = online ? ja : ja.filter((v) => v.localService !== false)
  const pool = usable.length > 0 ? usable : ja
  return pool
    .map((v, i) => ({ v, i, s: voiceScore(v) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.v)
}

/** `Microsoft Nanami Online (Natural) - Japanese (Japan)` → `Nanami Online (Natural)` */
export function voiceLabel(name: string): string {
  return name.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Japanese.*$/i, '').trim() || name
}

const isOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine !== false)

/**
 * 의존성을 주입받는다 — 테스트가 가짜 엔진을 넣을 수 있게. 기본값은 브라우저 전역.
 * node(테스트) 에서는 전역이 없어 자동으로 no-op 이 된다.
 */
export function createWebSpeechTts(
  synth: SpeechLike | undefined = typeof window === 'undefined' ? undefined : window.speechSynthesis,
  Utterance: typeof SpeechSynthesisUtterance | undefined =
    typeof SpeechSynthesisUtterance === 'undefined' ? undefined : SpeechSynthesisUtterance,
  readPrefs: () => TtsPrefs = loadTtsPrefs,
  online: () => boolean = isOnline,
): Tts {
  if (!synth || !Utterance) return NOOP_TTS

  // ja-JP 음성은 비동기로 채워진다 (voiceschanged). **발화할 때마다 목록을 새로 읽는다** — 캐시해 두면
  // 늦게 온 음성을 영영 못 쓴다. 없으면 lang 만 주고 엔진 판단에 맡긴다.
  const ranked = () => rankJapaneseVoices(synth.getVoices(), online())

  return {
    available: true,
    speak(text: string) {
      const t = text.trim()
      if (t === '') return
      synth.cancel() // 이전 발화 중단 — 카드가 빠르게 넘어가도 겹치지 않는다
      const prefs = readPrefs()
      const list = ranked()
      // 고른 음성이 이 기기에 없으면(다른 기기·브라우저에서 고른 이름) 자동으로 돌아간다
      const chosen =
        (prefs.voice !== '' ? list.find((v) => v.name === prefs.voice) : undefined) ?? list[0] ?? null
      const u = new Utterance(t)
      u.lang = 'ja-JP'
      if (chosen) u.voice = chosen
      u.rate = RATE_VALUE[prefs.rate] // 학습용으로 살짝 느리게(기본 0.9)
      synth.speak(u)
    },
    cancel() {
      synth.cancel()
    },
    voices() {
      return ranked().map((v) => ({
        name: v.name ?? '',
        label: voiceLabel(v.name ?? ''),
        online: v.localService === false,
      }))
    },
    onVoicesChanged(cb) {
      synth.addEventListener('voiceschanged', cb)
      return () => synth.removeEventListener?.('voiceschanged', cb)
    },
  }
}

/** 앱 전역 인스턴스 */
export const tts: Tts = createWebSpeechTts()
