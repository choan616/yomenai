// Web Speech 엔진을 가짜로 주입해 Tts 인터페이스를 검증한다. jsdom 없이 node 에서 돈다
import { describe, expect, it } from 'vitest'
import {
  createWebSpeechTts,
  rankJapaneseVoices,
  shapeForSpeech,
  uniqueLabels,
  voiceId,
  voiceLabel,
  voiceScore,
} from './tts.ts'
import type { TtsPrefs } from './ttsPrefs.ts'

class FakeUtterance {
  text: string
  lang = ''
  voice: unknown = null
  rate = 1
  volume = 1
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
    // 이 블록의 테스트는 발음 보정과 무관한 계약을 본다 — 보정이 켜지면 첫 발화가 깨우기라 의미가 흐려진다
    () => ({ voice: '', rate: 'normal', shape: false }),
    () => true,
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
type V = { name: string; lang: string; localService: boolean; voiceURI?: string }
const v = (name: string, localService = true, lang = 'ja-JP', voiceURI?: string): V => ({
  name,
  lang,
  localService,
  ...(voiceURI ? { voiceURI } : {}),
})
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
    const { t, calls } = buildWith({ voice: '', rate: 'normal', shape: false }, [
      ...WINDOWS_LEGACY,
      v('Microsoft Nanami Online (Natural) - Japanese (Japan)', false),
    ])
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toContain('Nanami')
  })

  it('사용자가 고른 음성이 자동 선택을 이긴다', () => {
    const { t, calls } = buildWith(
      { voice: 'Microsoft Ichiro - Japanese (Japan)', rate: 'normal', shape: false },
      [...WINDOWS_LEGACY, v('Microsoft Nanami Online (Natural) - Japanese (Japan)', false)],
    )
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toBe('Microsoft Ichiro - Japanese (Japan)')
  })

  it('고른 음성이 이 기기에 없으면 자동으로 돌아간다 — 다른 기기에서 고른 이름', () => {
    const { t, calls } = buildWith({ voice: 'Siri Voice 2', rate: 'normal', shape: false }, WINDOWS_LEGACY)
    t.speak('めいはく')
    expect((calls[0]!.voice as V).name).toBe('Microsoft Ayumi - Japanese (Japan)')
  })

  it('속도 단계가 rate 로 간다 — 보통은 예전 고정값 0.9', () => {
    for (const [rate, expected] of [
      ['slow', 0.75],
      ['normal', 0.9],
      ['fast', 1.05],
    ] as const) {
      const { t, calls } = buildWith({ voice: '', rate, shape: false }, WINDOWS_LEGACY)
      t.speak('めいはく')
      expect(calls[0]!.rate).toBe(expected)
    }
  })

  it('voices() 는 화면용 이름과 온라인 여부를 준다', () => {
    const { t } = buildWith({ voice: '', rate: 'normal', shape: false }, [
      v('Microsoft Ayumi - Japanese (Japan)'),
      v('Google 日本語', false),
    ])
    expect(t.voices()).toEqual([
      { id: 'Google 日本語', name: 'Google 日本語', label: 'Google 日本語', online: true },
      {
        id: 'Microsoft Ayumi - Japanese (Japan)',
        name: 'Microsoft Ayumi - Japanese (Japan)',
        label: 'Ayumi',
        online: false,
      },
    ])
  })

  it('음성이 늦게 채워져도 다음 발화부터 쓴다 — 목록을 캐시하지 않는다', () => {
    const late: V[] = []
    const { synth, calls } = makeSynth()
    synth.getVoices = () => late as unknown as Array<{ lang: string }>
    const t = createWebSpeechTts(
      synth as unknown as Parameters<typeof createWebSpeechTts>[0],
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      () => ({ voice: '', rate: 'normal', shape: false }),
      () => true,
    )
    t.speak('あ')
    expect(calls[0]!.voice).toBeNull()
    late.push(v('Kyoko (Enhanced)'))
    t.speak('あ')
    expect((calls[1]!.voice as V).name).toBe('Kyoko (Enhanced)')
  })
})

// ── 같은 이름의 음성 둘 (2026-10-03 실기기 발견) ──
// iPhone 의 설정 화면에서 선택지가 `Kyoko` 둘로 똑같이 보였다. 음성을 이름으로 식별한 탓에 라벨이 같고,
// 저장값이 이름이라 둘째를 고를 방법이 없었고, 목록의 key 도 겹쳤다.
describe('같은 이름의 음성이 둘일 때', () => {
  const KYOKO_COMPACT = v('Kyoko', true, 'ja-JP', 'com.apple.voice.compact.ja-JP.Kyoko')
  const KYOKO_ENHANCED = v('Kyoko', true, 'ja-JP', 'com.apple.voice.enhanced.ja-JP.Kyoko')

  it('voiceId 는 voiceURI 를 쓰고 없으면 이름이다', () => {
    expect(voiceId(KYOKO_COMPACT)).toBe('com.apple.voice.compact.ja-JP.Kyoko')
    expect(voiceId({ name: 'Kyoko' })).toBe('Kyoko')
  })

  it('라벨이 서로 다르다 — 품질 표지가 voiceURI 에 있으면 그걸 붙인다', () => {
    expect(uniqueLabels([KYOKO_COMPACT, KYOKO_ENHANCED])).toEqual(['Kyoko · 기본', 'Kyoko · 고음질'])
  })

  it('품질 표지가 없으면 순번으로 가른다 — 선택지가 구분돼야 한다', () => {
    const a = v('Kyoko', true, 'ja-JP', 'x.1')
    const b = v('Kyoko', true, 'ja-JP', 'x.2')
    expect(uniqueLabels([a, b])).toEqual(['Kyoko (1)', 'Kyoko (2)'])
  })

  it('이름이 유일하면 꼬리를 안 붙인다', () => {
    expect(uniqueLabels([v('Kyoko'), v('Otoya')])).toEqual(['Kyoko', 'Otoya'])
  })

  it('고음질판이 voiceURI 에만 표시돼도 자동 선택이 그쪽을 앞세운다', () => {
    const r = rankJapaneseVoices(as([KYOKO_COMPACT, KYOKO_ENHANCED]), true)
    expect(voiceId(r[0]!)).toBe('com.apple.voice.enhanced.ja-JP.Kyoko')
  })

  const buildWith = (voice: string) => {
    const { synth, calls } = makeSynth()
    synth.getVoices = () => [KYOKO_COMPACT, KYOKO_ENHANCED] as unknown as Array<{ lang: string }>
    const t = createWebSpeechTts(
      synth as unknown as Parameters<typeof createWebSpeechTts>[0],
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      () => ({ voice, rate: 'normal', shape: false }),
      () => true,
    )
    return { t, calls }
  }

  it('둘째를 고를 수 있다 — 이름이 같아도 고른 쪽으로 읽는다', () => {
    const { t, calls } = buildWith('com.apple.voice.compact.ja-JP.Kyoko')
    t.speak('あ')
    expect((calls[0]!.voice as V).voiceURI).toBe('com.apple.voice.compact.ja-JP.Kyoko')
  })

  it('voices() 의 id 와 라벨이 모두 유일하다', () => {
    const { t } = buildWith('')
    const list = t.voices()
    expect(new Set(list.map((x) => x.id)).size).toBe(2)
    expect(new Set(list.map((x) => x.label)).size).toBe(2)
  })

  it('이름으로 저장하던 때의 값도 받는다 — 같은 이름이 둘이면 앞쪽 하나', () => {
    const { t, calls } = buildWith('Kyoko')
    t.speak('あ')
    expect((calls[0]!.voice as V).name).toBe('Kyoko')
  })
})

// ── 발음 보정 (2026-10-03: 장음·촉음이 어색, 탁음이 맨 앞에 오면 끊긴다) ──
describe('shapeForSpeech — 장음을 ー 로', () => {
  const cases: [string, string][] = [
    ['とうきょう', 'とーきょー'], // お단 + う
    ['おおさか', 'おーさか'], // お단 + お
    ['せんせい', 'せんせー'], // え단 + い
    ['ねえ', 'ねー'], // え단 + え
    ['ゆうめい', 'ゆーめー'], // う단 + う, え단 + い
    ['おかあさん', 'おかーさん'], // あ단 + あ
    ['おいしい', 'おいしー'], // い단 + い
    ['くうき', 'くーき'], // う단 + う
    ['ぎゅうにゅう', 'ぎゅーにゅー'], // ゅ 도 う단으로 센다
    ['きょうと', 'きょーと'], // ょ 는 お단
    ['がっこう', 'がっこー'], // 촉음은 그대로, 장음만
    ['ちゅうじつ', 'ちゅーじつ'],
  ]
  for (const [raw, shaped] of cases) {
    it(`${raw} → ${shaped}`, () => expect(shapeForSpeech(raw)).toBe(shaped))
  }

  it('같은 모음이 이어지지 않으면 그대로다 — かいしゃ·ない·いう·めあ', () => {
    // あ단 + い(かい·ない), い단 + う(いう — 「ゆう」로 읽히는 말이라 엔진에 맡긴다), え단 + あ
    for (const w of ['かいしゃ', 'ない', 'いう', 'めあ']) {
      expect(shapeForSpeech(w)).toBe(w)
    }
  })

  it('가나가 아니면 건드리지 않는다 — 한자·카타카나·로마자·빈 문자열', () => {
    expect(shapeForSpeech('東京')).toBe('東京')
    expect(shapeForSpeech('トウキョウ')).toBe('トウキョウ')
    expect(shapeForSpeech('tou')).toBe('tou')
    expect(shapeForSpeech('')).toBe('')
  })

  it('이미 ー 가 있으면 그대로다', () => {
    expect(shapeForSpeech('とーきょー')).toBe('とーきょー')
  })

  it('이어진 모음도 겹쳐 먹지 않는다 — ほうおう 는 ほーおー', () => {
    expect(shapeForSpeech('ほうおう')).toBe('ほーおー')
  })
})

describe('speak 의 발음 보정', () => {
  const buildWith = (shape: boolean) => {
    const { synth, calls } = makeSynth(['ja-JP'])
    const t = createWebSpeechTts(
      synth as unknown as Parameters<typeof createWebSpeechTts>[0],
      FakeUtterance as unknown as typeof SpeechSynthesisUtterance,
      () => ({ voice: '', rate: 'normal', shape }),
      () => true,
    )
    return { t, calls }
  }

  it('켜면 장음을 고치고, 앞에 음량 0 의 깨우기 발화를 먼저 넣는다', () => {
    const { t, calls } = buildWith(true)
    t.speak('がっこう')
    expect(calls).toHaveLength(2)
    // 큐 순서: 깨우기 → 진짜
    expect(calls[0]).toMatchObject({ volume: 0, lang: 'ja-JP' })
    expect(calls[1]).toMatchObject({ text: 'がっこー', volume: 1, lang: 'ja-JP' })
  })

  it('깨우기 발화도 고른 음성을 쓴다 — 음성이 바뀌면 깨운 오디오가 소용없다', () => {
    const { t, calls } = buildWith(true)
    t.speak('あ')
    expect(calls[0]!.voice).toEqual({ lang: 'ja-JP' })
    expect(calls[1]!.voice).toEqual({ lang: 'ja-JP' })
  })

  it('끄면 원문 그대로 한 번만 읽는다 — 깨우기도 없다', () => {
    const { t, calls } = buildWith(false)
    t.speak('がっこう')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ text: 'がっこう', volume: 1 })
  })

  it('빈 문자열이면 깨우기도 안 넣는다', () => {
    const { t, calls } = buildWith(true)
    t.speak('  ')
    expect(calls).toHaveLength(0)
  })
})
