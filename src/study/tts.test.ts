// Web Speech 엔진을 가짜로 주입해 Tts 인터페이스를 검증한다. jsdom 없이 node 에서 돈다
import { describe, expect, it } from 'vitest'
import { createWebSpeechTts, rankJapaneseVoices, voiceLabel, voiceScore } from './tts.ts'
import type { TtsPrefs } from './ttsPrefs.ts'

class FakeUtterance {
  text: string
  lang = ''
  voice: unknown = null
  rate = 1
  constructor(text: string) {
    this.text = text
  }
}

interface FakeSynth {
  getVoices: () => Array<{ lang: string }>
  speak: (u: FakeUtterance) => void
  cancel: () => void
  addEventListener: (type: string, cb: () => void) => void
}

function makeSynth(voiceLangs: string[] = []) {
  const calls: FakeUtterance[] = []
  let cancelCount = 0
  const synth: FakeSynth = {
    getVoices: () => voiceLangs.map((lang) => ({ lang })),
    speak: (u) => calls.push(u),
    cancel: () => cancelCount++,
    addEventListener: () => {},
  }
  return { synth, calls, cancelCount: () => cancelCount }
}

function build(synth: FakeSynth) {
  return createWebSpeechTts(
    synth as unknown as Parameters<typeof createWebSpeechTts>[0],
    FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
  )
}

describe('createWebSpeechTts', () => {
  it('엔진이 없으면 available:false, speak 은 아무 일도 안 한다', () => {
    const t = createWebSpeechTts(undefined, undefined)
    expect(t.available).toBe(false)
    expect(() => t.speak('めいはく')).not.toThrow()
  })

  it('빈 문자열·공백은 무시한다', () => {
    const { synth, calls } = makeSynth()
    build(synth).speak('   ')
    expect(calls).toHaveLength(0)
  })

  it('ja-JP 로 발화하고 재생 전 이전 발화를 취소한다', () => {
    const { synth, calls, cancelCount } = makeSynth(['ja-JP'])
    build(synth).speak('めいはく')
    expect(calls).toHaveLength(1)
    expect(calls[0].text).toBe('めいはく')
    expect(calls[0].lang).toBe('ja-JP')
    expect(calls[0].voice).toEqual({ lang: 'ja-JP' })
    expect(cancelCount()).toBe(1) // speak 진입 시 1회
  })

  it('ja 음성이 없으면 voice 없이 lang 만으로 진행한다', () => {
    const { synth, calls } = makeSynth(['en-US', 'ko-KR'])
    build(synth).speak('めいはく')
    expect(calls[0].voice).toBeNull()
    expect(calls[0].lang).toBe('ja-JP')
  })
})

// ── 소리가 덜 딱딱하게 (2026-10-03) ──
type V = { name: string; lang: string; localService: boolean }
const v = (name: string, localService = true, lang = 'ja-JP'): V => ({ name, lang, localService })
const as = (list: V[]) => list as unknown as SpeechSynthesisVoice[]

/** 실제 환경에서 본 목록들 — Windows 구형 넷(이 기기), Edge, 크롬, iOS */
const WINDOWS_LEGACY = [
  v('Microsoft Ayumi - Japanese (Japan)'),
  v('Microsoft Haruka - Japanese (Japan)'),
  v('Microsoft Ichiro - Japanese (Japan)'),
  v('Microsoft Sayaka - Japanese (Japan)'),
]

describe('rankJapaneseVoices', () => {
  it('일본어가 아닌 음성은 뺀다', () => {
    const r = rankJapaneseVoices(as([v('Microsoft Zira', true, 'en-US'), v('Kyoko')]), true)
    expect(r.map((x) => x.name)).toEqual(['Kyoko'])
  })

  it('신경망(Natural) 음성이 구형 로컬 음성보다 앞선다 — Edge', () => {
    const r = rankJapaneseVoices(
      as([...WINDOWS_LEGACY, v('Microsoft Nanami Online (Natural) - Japanese (Japan)', false)]),
      true,
    )
    expect(r[0]!.name).toContain('Nanami')
  })

  it('Google 네트워크 음성이 로컬 구형보다 앞선다 — 크롬', () => {
    const r = rankJapaneseVoices(as([...WINDOWS_LEGACY, v('Google 日本語', false)]), true)
    expect(r[0]!.name).toBe('Google 日本語')
  })

  it('애플의 고품질판(Enhanced·Premium)이 기본(Compact)보다 앞선다 — iOS', () => {
    const r = rankJapaneseVoices(as([v('Kyoko'), v('Kyoko (Enhanced)'), v('Otoya')]), true)
    expect(r.map((x) => x.name)).toEqual(['Kyoko (Enhanced)', 'Kyoko', 'Otoya'])
  })

  it('점수가 같으면 브라우저가 준 순서를 지킨다 — 구형만 있는 기기에서 소리를 안 바꾼다', () => {
    const r = rankJapaneseVoices(as(WINDOWS_LEGACY), true)
    expect(r.map((x) => x.name)).toEqual(WINDOWS_LEGACY.map((x) => x.name))
  })

  it('오프라인이면 네트워크 음성을 뺀다 — 연결이 없으면 소리 없이 실패한다', () => {
    const list = as([v('Google 日本語', false), v('Kyoko')])
    expect(rankJapaneseVoices(list, true)[0]!.name).toBe('Google 日本語')
    expect(rankJapaneseVoices(list, false).map((x) => x.name)).toEqual(['Kyoko'])
  })

  it('오프라인인데 로컬 음성이 하나도 없으면 그대로 둔다 — 빼면 소리 자체가 사라진다', () => {
    const r = rankJapaneseVoices(as([v('Google 日本語', false)]), false)
    expect(r.map((x) => x.name)).toEqual(['Google 日本語'])
  })
})

describe('voiceScore · voiceLabel', () => {
  it('구형 데스크톱 합성기는 같은 로컬 음성보다 뒤다', () => {
    expect(voiceScore({ name: 'Microsoft Haruka Desktop - Japanese', localService: true })).toBeLessThan(
      voiceScore({ name: 'Microsoft Ayumi - Japanese (Japan)', localService: true }),
    )
  })

  it('이름이 없는 가짜 음성도 점수가 0 이다 — 기존 테스트의 { lang } 만 있는 음성', () => {
    expect(voiceScore({})).toBe(0)
  })

  it('화면용 이름에서 접두사와 언어 꼬리를 뗀다', () => {
    expect(voiceLabel('Microsoft Nanami Online (Natural) - Japanese (Japan)')).toBe('Nanami Online (Natural)')
    expect(voiceLabel('Google 日本語')).toBe('Google 日本語')
    expect(voiceLabel('')).toBe('')
  })
})

describe('고른 취향을 반영한다', () => {
  const buildWith = (prefs: TtsPrefs, voices: V[], online = true) => {
    const { synth, calls } = makeSynth()
    synth.getVoices = () => voices as unknown as Array<{ lang: string }>
    const t = createWebSpeechTts(
      synth as unknown as Parameters<typeof createWebSpeechTts>[0],
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      () => prefs,
      () => online,
    )
    return { t, calls }
  }

  it('자동이면 가장 자연스러울 것 같은 음성으로 읽는다', () => {
    const { t, calls } = buildWith({ voice: '', rate: 'normal' }, [
      ...WINDOWS_LEGACY,
      v('Microsoft Nanami Online (Natural) - Japanese (Japan)', false),
    ])
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toContain('Nanami')
  })

  it('사용자가 고른 음성이 자동 선택을 이긴다', () => {
    const { t, calls } = buildWith(
      { voice: 'Microsoft Ichiro - Japanese (Japan)', rate: 'normal' },
      [...WINDOWS_LEGACY, v('Microsoft Nanami Online (Natural) - Japanese (Japan)', false)],
    )
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toBe('Microsoft Ichiro - Japanese (Japan)')
  })

  it('고른 음성이 이 기기에 없으면 자동으로 돌아간다 — 다른 기기에서 고른 이름', () => {
    const { t, calls } = buildWith({ voice: 'Siri Voice 2', rate: 'normal' }, WINDOWS_LEGACY)
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toBe('Microsoft Ayumi - Japanese (Japan)')
  })

  it('속도 단계가 rate 로 간다 — 보통은 예전 고정값 0.9', () => {
    for (const [rate, expected] of [
      ['slow', 0.75],
      ['normal', 0.9],
      ['fast', 1.05],
    ] as const) {
      const { t, calls } = buildWith({ voice: '', rate }, WINDOWS_LEGACY)
      t.speak('めいはく')
      expect(calls[0]!.rate).toBe(expected)
    }
  })

  it('voices() 는 화면용 이름과 온라인 여부를 준다', () => {
    const { t } = buildWith({ voice: '', rate: 'normal' }, [
      v('Microsoft Ayumi - Japanese (Japan)'),
      v('Google 日本語', false),
    ])
    expect(t.voices()).toEqual([
      { name: 'Google 日本語', label: 'Google 日本語', online: true },
      { name: 'Microsoft Ayumi - Japanese (Japan)', label: 'Ayumi', online: false },
    ])
  })

  it('음성이 늦게 채워져도 다음 발화부터 쓴다 — 목록을 캐시하지 않는다', () => {
    const late: V[] = []
    const { synth, calls } = makeSynth()
    synth.getVoices = () => late as unknown as Array<{ lang: string }>
    const t = createWebSpeechTts(
      synth as unknown as Parameters<typeof createWebSpeechTts>[0],
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      () => ({ voice: '', rate: 'normal' }),
      () => true,
    )
    t.speak('あ')
    expect(calls[0]!.voice).toBeNull()
    late.push(v('Kyoko (Enhanced)'))
    t.speak('あ')
    expect((calls[1]!.voice as V).name).toBe('Kyoko (Enhanced)')
  })
})
