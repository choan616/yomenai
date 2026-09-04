// Web Speech 엔진을 가짜로 주입해 Tts 인터페이스를 검증한다. jsdom 없이 node 에서 돈다
import { describe, expect, it } from 'vitest'
import { createWebSpeechTts } from './tts.ts'

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
