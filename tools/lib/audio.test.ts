// 음성 파일 이름·읽기 목록 규칙 검증
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { audioName, uniqueReadings } from './audio.ts'

describe('audioName', () => {
  it('같은 읽기는 늘 같은 이름이다', () => {
    expect(audioName('がっこう')).toBe(audioName('がっこう'))
  })

  it('ASCII 16자리 hex + .mp3', () => {
    expect(audioName('がっこう')).toMatch(/^[0-9a-f]{16}\.mp3$/)
  })

  it('NFC/NFD 로 적은 같은 읽기는 같은 이름이다', () => {
    expect(audioName('ぎゅうにゅう'.normalize('NFD'))).toBe(audioName('ぎゅうにゅう'))
  })

  it('다른 읽기는 다른 이름이다', () => {
    expect(audioName('かんい')).not.toBe(audioName('かに'))
  })

  it('기본 사전의 읽기 전체에서 이름이 겹치지 않는다', () => {
    const base = JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: { reading: string }[] }
    const readings = uniqueReadings(base.idioms)
    expect(readings.length).toBeGreaterThan(10000)
    expect(new Set(readings.map(audioName)).size).toBe(readings.length)
  })
})

describe('uniqueReadings', () => {
  it('중복과 빈 읽기를 빼고 정렬한다', () => {
    expect(uniqueReadings([{ reading: 'ちち' }, { reading: 'あい' }, { reading: 'ちち' }, { reading: ' ' }])).toEqual([
      'あい',
      'ちち',
    ])
  })

  it('NFD 로 적힌 읽기는 NFC 로 합쳐 센다', () => {
    expect(uniqueReadings([{ reading: 'が' }, { reading: 'が'.normalize('NFD') }])).toHaveLength(1)
  })
})
