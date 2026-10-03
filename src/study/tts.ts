// 확인 단계에서 정답 읽기를 소리로 들려준다. Web Speech API 우선, 엔진은 Tts 인터페이스 뒤에 둔다 (PLAN §6)
import { loadTtsPrefs, RATE_VALUE, type TtsPrefs } from './ttsPrefs.ts'

/** 설정 화면이 고르게 보여 주는 음성 한 개 */
export interface TtsVoice {
  /**
   * 음성을 가리키는 값 — **저장하는 값이다.** `voiceURI` 를 쓴다. 이름으로 하면 안 된다 (2026-10-03):
   * iOS 는 `Kyoko` 를 같은 이름으로 둘 내줘서, 이름을 키로 삼으면 선택지 둘이 구분이 안 되고
   * 둘째를 고를 방법도 없었다(실기기에서 발견). `voiceURI` 가 없으면 이름으로 돌아간다
   */
  id: string
  /** 브라우저가 부르는 이름. 기기마다 다르다 */
  name: string
  /** 화면용 이름. 같은 이름이 둘 이상이면 구분되도록 꼬리를 붙인다 */
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
export function voiceScore(v: { name?: string; voiceURI?: string; localService?: boolean }): number {
  // 이름만으로는 같은 이름의 두 음성을 못 가른다 — iOS 는 고음질판을 `voiceURI` 에만 표시하기도 한다
  const name = `${v.name ?? ''} ${v.voiceURI ?? ''}`
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

/** `voiceURI` 에 남는 품질 표지 → 화면에 붙일 꼬리. 먼저 맞는 것을 쓴다 */
const QUALITY_TAGS: [RegExp, string][] = [
  [/premium/i, '프리미엄'],
  [/enhanced/i, '고음질'],
  [/siri/i, 'Siri'],
  [/compact/i, '기본'],
]

/**
 * 화면용 이름을 **서로 다르게** 만든다. 같은 이름이 둘 이상이면 `voiceURI` 의 품질 표지(프리미엄·고음질·
 * Siri·기본)를 붙이고, 그래도 겹치면 순번을 붙인다 — 선택지가 서로 구분돼야 둘째를 고를 수 있다.
 * 이름이 유일하면 그대로 둔다.
 */
export function uniqueLabels(
  voices: readonly { name?: string; voiceURI?: string }[],
): string[] {
  const base = voices.map((v) => voiceLabel(v.name ?? ''))
  const count = new Map<string, number>()
  for (const b of base) count.set(b, (count.get(b) ?? 0) + 1)
  const tagged = voices.map((v, i) => {
    if ((count.get(base[i]!) ?? 0) < 2) return base[i]!
    const tag = QUALITY_TAGS.find(([re]) => re.test(v.voiceURI ?? ''))?.[1]
    return tag ? `${base[i]} · ${tag}` : base[i]!
  })
  // 꼬리를 붙여도 겹치면(품질 표지가 같거나 없으면) 순번으로 가른다
  const seen = new Map<string, number>()
  const total = new Map<string, number>()
  for (const t of tagged) total.set(t, (total.get(t) ?? 0) + 1)
  return tagged.map((t) => {
    if ((total.get(t) ?? 0) < 2) return t
    const n = (seen.get(t) ?? 0) + 1
    seen.set(t, n)
    return `${t} (${n})`
  })
}

/**
 * 장음을 `ー` 로 적는다 (2026-10-03 사용자 「장음이 어색하다」).
 *
 * 히라가나 낱말을 문맥 없이 받으면 시스템 음성이 `おう` 를 「오·우」 두 박으로 읽는 일이 흔하다. 일본어 TTS 에서
 * 장음을 `ー` 로 적으면 길게 읽히는 것은 널리 쓰이는 처방이다. 같은 모음이 이어지는 자리만 바꾼다 —
 * `お단 + う/お`, `え단 + い/え`, 그 밖에는 같은 단끼리(`ああ`·`いい`·`うう`). `ょ`·`ゅ`·`ゃ` 도 그 단으로 센다.
 *
 * **소리는 못 들어서 효과를 모른다.** 그래서 설정에서 끄고 켤 수 있다(`TtsPrefs.shape`).
 * 가나가 아닌 글자는 건드리지 않는다.
 */
const A_ROW = 'あかさたなはまやらわがざだばぱゃぁ'
const I_ROW = 'いきしちにひみりぎじぢびぴぃ'
const U_ROW = 'うくすつぬふむゆるぐずづぶぷゅぅ'
const E_ROW = 'えけせてねへめれげぜでべぺぇ'
const O_ROW = 'おこそとのほもよろをごぞどぼぽょぉ'
const LONG_VOWEL = new RegExp(
  `([${O_ROW}])[うお]|([${E_ROW}])[いえ]|([${A_ROW}])あ|([${I_ROW}])い|([${U_ROW}])う`,
  'g',
)
export function shapeForSpeech(text: string): string {
  // 앞 글자를 되돌려 주고 이어지는 모음만 ー 로 바꾼다
  return text.replace(LONG_VOWEL, (_m, o, e, a, i, u) => `${o ?? e ?? a ?? i ?? u}ー`)
}

/** 음성을 가리키는 값 — `voiceURI`, 없으면 이름 */
export const voiceId = (v: { name?: string; voiceURI?: string }): string => v.voiceURI || (v.name ?? '')

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
      const spoken = prefs.shape ? shapeForSpeech(t) : t
      // 고른 음성이 이 기기에 없으면(다른 기기·브라우저에서 고른 값) 자동으로 돌아간다.
      // 이름으로 저장하던 때의 값도 받는다(같은 이름이 둘이면 첫째)
      const chosen =
        (prefs.voice !== ''
          ? (list.find((v) => voiceId(v) === prefs.voice) ?? list.find((v) => v.name === prefs.voice))
          : undefined) ??
        list[0] ??
        null
      if (prefs.shape) {
        // 오디오를 깨워 둔다 (2026-10-03 사용자 「탁음이 처음에 나오면 끊겨 들린다」). iOS 는 오디오가 잠든 채 첫
        // 발화를 시작하면 맨 앞 음절을 자르는 일이 알려져 있다. 음량 0 의 짧은 발화를 큐 앞에 먼저 넣으면 진짜
        // 발화는 이미 깨어난 오디오에서 시작한다. 비용은 발화마다 약 100~300ms 의 지연이다
        const wake = new Utterance('、')
        wake.lang = 'ja-JP'
        wake.volume = 0
        if (chosen) wake.voice = chosen
        synth.speak(wake)
      }
      const u = new Utterance(spoken)
      u.lang = 'ja-JP'
      if (chosen) u.voice = chosen
      u.rate = RATE_VALUE[prefs.rate] // 학습용으로 살짝 느리게(기본 0.9)
      synth.speak(u)
    },
    cancel() {
      synth.cancel()
    },
    voices() {
      const list = ranked()
      const labels = uniqueLabels(list)
      return list.map((v, i) => ({
        id: voiceId(v),
        name: v.name ?? '',
        label: labels[i]!,
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
