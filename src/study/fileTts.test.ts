// 음성 파일 재생 엔진 검증 — 파일 우선, 실패하면 기기 음성, 제스처 안 resume, 요청 교체
import { describe, expect, it, vi } from 'vitest'
import { audioName } from '../lib/audioName.ts'
import { createFileTts, PLAYING_SESSION } from './fileTts.ts'
import type { Tts } from './tts.ts'
import type { TtsPrefs } from './ttsPrefs.ts'
import { fileVoiceFor } from './voiceFiles.ts'

const BASE = '/yomenai-audio'
const prefs = (voice = ''): TtsPrefs => ({ voice, rate: 'normal', shape: false })

function setup(
  opts: {
    voice?: string
    base?: string
    fetchImpl?: (url: string) => Promise<Response>
    session?: { type: string } | null
  } = {},
) {
  const fallback: Tts & { spoken: string[]; cancelled: number } = {
    available: true,
    spoken: [],
    cancelled: 0,
    speak(t: string) {
      this.spoken.push(t)
    },
    cancel() {
      this.cancelled++
    },
    voices: () => [{ id: 'dev', name: 'Kyoko', label: 'Kyoko', online: false }],
    onVoicesChanged: () => () => {},
  }
  const sources: { started: number; stopped: number; buffer: unknown }[] = []
  const events: string[] = []
  const ctx = {
    destination: {},
    resume: vi.fn(() => {
      events.push('resume')
      return Promise.resolve()
    }),
    decodeAudioData: vi.fn(async (b: ArrayBuffer) => ({ decoded: b.byteLength })),
    createBufferSource() {
      const s = {
        started: 0,
        stopped: 0,
        buffer: null as unknown,
        onended: null as (() => void) | null,
        connect: () => {},
        start() {
          this.started++
        },
        stop() {
          this.stopped++
        },
      }
      sources.push(s)
      return s
    },
  }
  const urls: string[] = []
  const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
    urls.push(String(url))
    events.push('fetch')
    return opts.fetchImpl ? opts.fetchImpl(String(url)) : new Response(new Uint8Array([1, 2, 3]), { status: 200 })
  })
  const tts = createFileTts({
    fallback,
    base: () => opts.base ?? BASE,
    readPrefs: () => prefs(opts.voice),
    fetchFn: fetchFn as unknown as typeof fetch,
    makeContext: () => ctx,
    audioSession: opts.session ?? null,
  })
  return { tts, fallback, sources, urls, ctx, events, fetchFn }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

describe('음성 파일 재생', () => {
  it('자동(저장값 없음)이면 玄野武宏 파일을 받아 재생한다', async () => {
    const { tts, fallback, sources, urls } = setup()
    tts.speak('がっこう')
    await flush()
    expect(urls).toEqual([`${BASE}/kurono/${audioName('がっこう')}`])
    expect(sources).toHaveLength(1)
    expect(sources[0]!.started).toBe(1)
    expect(fallback.spoken).toEqual([])
  })

  it('resume 을 받기보다 먼저, 같은 동기 구간에서 부른다 (iOS 제스처)', () => {
    const { tts, events } = setup()
    tts.speak('がっこう')
    // 아직 아무 await 도 안 거쳤다 — resume 이 이미 불렸고 fetch 는 그 뒤
    expect(events[0]).toBe('resume')
  })

  it('고른 음성이 四国めたん 이면 그 폴더에서 받는다', async () => {
    const { tts, urls } = setup({ voice: 'file:metan' })
    tts.speak('きっぷ')
    await flush()
    expect(urls[0]).toBe(`${BASE}/metan/${audioName('きっぷ')}`)
  })

  it('알 수 없는 file: 값은 기본 음성으로 읽는다', async () => {
    const { tts, urls } = setup({ voice: 'file:없는음성' })
    tts.speak('きっぷ')
    await flush()
    expect(urls[0]).toContain('/kurono/')
  })

  it('기기 음성을 골랐으면 파일을 받지 않고 기기 음성으로 읽는다', async () => {
    const { tts, fallback, fetchFn } = setup({ voice: 'com.apple.voice.compact.ja-JP.Kyoko' })
    tts.speak('がっこう')
    await flush()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(fallback.spoken).toEqual(['がっこう'])
  })

  it('음성 파일 주소가 비어 있으면(개발·시험) 기기 음성으로 읽는다', async () => {
    const { tts, fallback, fetchFn } = setup({ base: '' })
    tts.speak('がっこう')
    await flush()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(fallback.spoken).toEqual(['がっこう'])
  })

  it('빈 문자열은 무시한다', async () => {
    const { tts, fallback, fetchFn } = setup()
    tts.speak('  ')
    await flush()
    expect(fetchFn).not.toHaveBeenCalled()
    expect(fallback.spoken).toEqual([])
  })

  it('404 면 기기 음성으로 돌아가고, 같은 읽기를 다시 눌러도 서버에 또 묻지 않는다', async () => {
    const { tts, fallback, fetchFn } = setup({ fetchImpl: async () => new Response('', { status: 404 }) })
    tts.speak('ないよみ')
    await flush()
    tts.speak('ないよみ')
    await flush()
    expect(fallback.spoken).toEqual(['ないよみ', 'ないよみ'])
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('네트워크가 끊겼으면(받기 실패) 기기 음성으로 돌아가고, 다음엔 다시 시도한다', async () => {
    const { tts, fallback, fetchFn } = setup({
      fetchImpl: async () => {
        throw new TypeError('Failed to fetch')
      },
    })
    tts.speak('がっこう')
    await flush()
    tts.speak('がっこう')
    await flush()
    expect(fallback.spoken).toHaveLength(2)
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('받았지만 해독이 안 되면(개발 서버의 HTML 응답 등) 기기 음성으로 돌아간다', async () => {
    const { tts, fallback, ctx, sources } = setup()
    ctx.decodeAudioData.mockRejectedValueOnce(new Error('EncodingError'))
    tts.speak('がっこう')
    await flush()
    expect(fallback.spoken).toEqual(['がっこう'])
    expect(sources).toHaveLength(0)
  })

  it('같은 읽기를 다시 누르면 다시 받지 않고 메모리의 소리를 쓴다', async () => {
    const { tts, fetchFn, sources } = setup()
    tts.speak('がっこう')
    await flush()
    tts.speak('がっこう')
    await flush()
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(sources).toHaveLength(2)
    expect(sources[1]!.started).toBe(1)
  })

  it('받는 사이에 다른 읽기를 누르면 앞 요청의 소리는 버린다', async () => {
    let release!: (r: Response) => void
    const slow = new Promise<Response>((r) => (release = r))
    let n = 0
    const { tts, sources } = setup({
      fetchImpl: () => (n++ === 0 ? slow : Promise.resolve(new Response(new Uint8Array([9]), { status: 200 }))),
    })
    tts.speak('ひとつめ')
    tts.speak('ふたつめ')
    await flush()
    release(new Response(new Uint8Array([1]), { status: 200 }))
    await flush()
    expect(sources).toHaveLength(1) // 둘째 것만
  })

  it('새 읽기를 시작하면 재생 중이던 소리를 멈춘다', async () => {
    const { tts, sources } = setup()
    tts.speak('がっこう')
    await flush()
    tts.speak('きっぷ')
    await flush()
    expect(sources[0]!.stopped).toBe(1)
    expect(sources[1]!.started).toBe(1)
  })

  it('파일 재생을 시작할 때 기기 음성이 말하던 중이면 멈춘다', async () => {
    const { tts, fallback } = setup()
    tts.speak('がっこう')
    await flush()
    expect(fallback.cancelled).toBeGreaterThan(0)
  })

  it('cancel 은 재생을 멈추고 늦게 도착한 소리도 버린다', async () => {
    let release!: (r: Response) => void
    const { tts, sources } = setup({ fetchImpl: () => new Promise<Response>((r) => (release = r)) })
    tts.speak('がっこう')
    tts.cancel()
    release(new Response(new Uint8Array([1]), { status: 200 }))
    await flush()
    expect(sources).toHaveLength(0)
  })
})

describe('무음 스위치 (오디오 세션)', () => {
  it('재생하기 전에 재생 세션으로 바꾸고, 소리가 끝나면 원래대로 되돌린다', async () => {
    const session = { type: 'auto' }
    const { tts, sources } = setup({ session })
    tts.speak('がっこう')
    expect(session.type).toBe(PLAYING_SESSION) // resume·fetch 보다 앞, 같은 동기 구간
    await flush()
    expect(session.type).toBe(PLAYING_SESSION) // 재생 중
    ;(sources[0] as unknown as { onended: () => void }).onended()
    expect(session.type).toBe('auto')
  })

  it('cancel 하면 되돌린다', async () => {
    const session = { type: 'auto' }
    const { tts } = setup({ session })
    tts.speak('がっこう')
    await flush()
    tts.cancel()
    expect(session.type).toBe('auto')
  })

  it('파일이 없어 기기 음성으로 돌아가도 되돌린다', async () => {
    const session = { type: 'auto' }
    const { tts, fallback } = setup({ session, fetchImpl: async () => new Response('', { status: 404 }) })
    tts.speak('ないよみ')
    await flush()
    expect(fallback.spoken).toEqual(['ないよみ'])
    expect(session.type).toBe('auto')
  })

  it('이어서 다른 읽기를 눌러도 처음의 원래 값을 기억한다', async () => {
    const session = { type: 'auto' }
    const { tts, sources } = setup({ session })
    tts.speak('がっこう')
    await flush()
    tts.speak('きっぷ')
    await flush()
    ;(sources[1] as unknown as { onended: () => void }).onended()
    expect(session.type).toBe('auto') // 재생 세션이 아니라
  })

  it('기기 음성을 고르면 세션을 건드리지 않는다', async () => {
    const session = { type: 'auto' }
    const { tts } = setup({ session, voice: 'Kyoko' })
    tts.speak('がっこう')
    await flush()
    expect(session.type).toBe('auto')
  })

  it('오디오 세션이 없는 환경(데스크톱·구형)에서도 그대로 재생된다', async () => {
    const { tts, sources } = setup({ session: null })
    tts.speak('がっこう')
    await flush()
    expect(sources[0]!.started).toBe(1)
  })
})

describe('음성 목록', () => {
  it('음성 파일 둘이 맨 앞에, 기기 음성이 그 뒤에 온다', () => {
    const { tts } = setup()
    expect(tts.voices().map((v) => v.id)).toEqual(['file:kurono', 'file:metan', 'dev'])
  })

  it('음성 파일 주소가 비어 있으면 기기 음성만 나온다', () => {
    const { tts } = setup({ base: '' })
    expect(tts.voices().map((v) => v.id)).toEqual(['dev'])
  })
})

describe('fileVoiceFor', () => {
  it('저장값 → 쓸 음성 파일', () => {
    expect(fileVoiceFor('', BASE)?.key).toBe('kurono')
    expect(fileVoiceFor('file:metan', BASE)?.key).toBe('metan')
    expect(fileVoiceFor('file:zzz', BASE)?.key).toBe('kurono')
    expect(fileVoiceFor('Kyoko', BASE)).toBeNull()
    expect(fileVoiceFor('', '')).toBeNull()
  })
})
