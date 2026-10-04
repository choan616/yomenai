// 미리 합성한 음성 파일로 읽기를 들려주는 Tts. 파일이 없거나 실패하면 기기 음성(fallback)으로 돌아간다
//
// `<audio>` 가 아니라 Web Audio 로 재생한다: `<audio>` 는 Range 요청(iOS 는 `bytes=0-1` 부터)을 보내는데 서비스 워커가
// 206 을 캐시하지 못해 오프라인이 깨진다. `fetch` 는 200 전체 응답이라 `CacheFirst` 로 캐시된다.
// iOS 는 `AudioContext.resume()` 이 사용자 제스처 안에서 불려야 소리가 난다 — `speak()` 가 첫 줄에서 동기로 부른다
// (읽기 듣기는 모두 버튼 클릭에서 시작한다). 파일 이름이 동기 해시라 비동기가 `await` 한 번(받기) 뒤에만 생긴다.
//
// **무음 스위치를 무시한다** (2026-10-04 사용자 실기기 「무음스위치에서는 재생 안 된다」 → 「의도적인 재생이라 안 나오는 게 어색하다」).
// iOS 는 Web Audio 를 기본(ambient) 세션으로 재생해 스위치를 따른다. `navigator.audioSession.type` 을 재생 세션으로 바꾸면 스위치를 무시한다(`PLAYING_SESSION`).
// 세션은 페이지 전체가 공유해서, 자판 소리(`keyFeedback.ts`)까지 스위치를 무시하게 되지 않도록 **재생하는 동안만** 바꾸고 끝나면 되돌린다.
import { audioName } from '../lib/audioName.ts'
import { loadTtsPrefs, type TtsPrefs } from './ttsPrefs.ts'
import type { Tts, TtsVoice } from './tts.ts'
import { audioBase, FILE_VOICES, fileVoiceFor } from './voiceFiles.ts'

/**
 * 재생하는 동안의 오디오 세션 종류. `transient-solo` — 명세: 「다른 소리를 멈추고 혼자 재생하며, 끝나면 멈춘 소리를 다시 잇는다」(W3C audio-session explainer).
 * `playback` 은 무음 스위치를 무시하지만 끝나도 음악이 안 이어졌다(2026-10-04 사용자 실기기 「끊긴다」 → 「재생 시에만 멈추는 선택은?」).
 * **WebKit 이 `transient-solo` 에서도 무음 스위치를 무시하는지는 확인하지 못했다.** 안 무시하면 `playback` 으로 되돌린다
 */
export const PLAYING_SESSION = 'transient-solo'

/** 디코드한 소리를 이만큼까지 메모리에 둔다 — 같은 읽기를 연달아 누를 때 다시 받지 않게 */
const MEMORY_MAX = 60

interface SourceLike {
  buffer: unknown
  connect(dest: unknown): unknown
  start(): void
  stop(): void
  onended: (() => void) | null
}
interface ContextLike {
  readonly destination: unknown
  resume(): Promise<void>
  decodeAudioData(data: ArrayBuffer): Promise<unknown>
  createBufferSource(): SourceLike
}

export interface FileTtsDeps {
  fallback: Tts
  base?: () => string
  readPrefs?: () => TtsPrefs
  fetchFn?: typeof fetch
  /** 테스트가 가짜를 넣는다. 기본은 브라우저의 AudioContext */
  makeContext?: () => ContextLike | null
  /** 오디오 세션 (iOS 16.4+ Safari). 없으면 건드리지 않는다 */
  audioSession?: { type: string } | null
}

const defaultContext = (): ContextLike | null => {
  const Ctor = typeof window === 'undefined' ? undefined : window.AudioContext
  return Ctor ? (new Ctor() as unknown as ContextLike) : null
}

const defaultSession = (): { type: string } | null =>
  typeof navigator === 'undefined' ? null : ((navigator as unknown as { audioSession?: { type: string } }).audioSession ?? null)

export function createFileTts({
  fallback,
  base = audioBase,
  readPrefs = loadTtsPrefs,
  fetchFn = (...a) => fetch(...a),
  makeContext = defaultContext,
  audioSession = defaultSession(),
}: FileTtsDeps): Tts {
  let ctx: ContextLike | null | undefined
  let current: SourceLike | null = null
  /** 가장 최근 요청의 번호 — 받는 사이 다른 읽기를 누르면 앞 요청의 소리는 버린다 */
  let seq = 0
  const memory = new Map<string, unknown>()
  /** 서버에 없다고 한 주소 — 사전 밖 읽기를 누를 때마다 다시 묻지 않게 (세션 동안) */
  const missing = new Set<string>()

  /** 재생 전에 바꾸기 전 세션 종류. 바꾼 상태가 아니면 null */
  let savedSession: string | null = null
  const claimSession = (): void => {
    if (!audioSession || savedSession !== null) return
    try {
      savedSession = audioSession.type
      audioSession.type = PLAYING_SESSION
    } catch {
      savedSession = null
    }
  }
  const releaseSession = (): void => {
    if (!audioSession || savedSession === null) return
    try {
      audioSession.type = savedSession
    } catch {
      /* 되돌리지 못해도 소리는 난다 */
    }
    savedSession = null
  }

  const stopCurrent = (): void => {
    if (!current) return
    current.onended = null
    try {
      current.stop()
    } catch {
      /* 이미 끝난 소리 */
    }
    current = null
  }

  async function load(url: string, context: ContextLike): Promise<unknown> {
    const hit = memory.get(url)
    if (hit !== undefined) return hit
    if (missing.has(url)) throw new Error('missing')
    const res = await fetchFn(url)
    if (!res.ok) {
      if (res.status === 404) missing.add(url)
      throw new Error(`HTTP ${res.status}`)
    }
    const buffer = await context.decodeAudioData(await res.arrayBuffer())
    memory.set(url, buffer)
    if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value as string)
    return buffer
  }

  return {
    get available() {
      return base() !== '' || fallback.available
    },
    speak(text: string) {
      const t = text.trim()
      if (t === '') return
      const root = base()
      const voice = fileVoiceFor(readPrefs().voice, root)
      if (!voice) {
        seq++
        stopCurrent()
        releaseSession()
        fallback.speak(t)
        return
      }
      const mine = ++seq
      stopCurrent()
      fallback.cancel() // 기기 음성이 말하던 중이면 멈춘다
      claimSession() // 제스처 안에서 소리를 내기 전에
      ctx ??= makeContext()
      if (!ctx) {
        releaseSession()
        fallback.speak(t)
        return
      }
      const context = ctx
      void context.resume().catch(() => {}) // 제스처 안에서 동기로 부른다
      void (async () => {
        try {
          const buffer = await load(`${root}/${voice.key}/${audioName(t)}`, context)
          if (mine !== seq) return
          const src = context.createBufferSource()
          src.buffer = buffer
          src.connect(context.destination)
          src.onended = () => {
            if (current === src) {
              current = null
              releaseSession()
            }
          }
          src.start()
          current = src
        } catch {
          // 파일이 없거나(사전 밖 읽기·아직 안 올린 음성) 받지 못했거나(오프라인) 해독이 안 됐다 → 기기 음성
          if (mine === seq) {
            releaseSession()
            fallback.speak(t)
          }
        }
      })()
    },
    cancel() {
      seq++
      stopCurrent()
      releaseSession()
      fallback.cancel()
    },
    voices(): TtsVoice[] {
      const files: TtsVoice[] =
        base() === '' ? [] : FILE_VOICES.map((v) => ({ id: v.id, name: v.label, label: v.label, online: false }))
      return [...files, ...fallback.voices()]
    },
    onVoicesChanged: (cb) => fallback.onVoicesChanged(cb),
  }
}
