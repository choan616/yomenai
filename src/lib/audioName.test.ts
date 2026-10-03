// 동기 sha256 이 표준 구현과 같은 값을 내는지 — 합성 도구가 만든 파일 이름과 어긋나면 앱이 파일을 못 찾는다
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { audioName, sha256Hex } from './audioName.ts'

const nodeHex = (s: string): string => createHash('sha256').update(s).digest('hex')
const enc = new TextEncoder()

describe('sha256Hex', () => {
  it('표준 시험 벡터', () => {
    expect(sha256Hex(enc.encode(''))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex(enc.encode('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('블록 경계 길이(55·56·63·64·65바이트)에서 Node 와 같다', () => {
    for (const n of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const s = 'a'.repeat(n)
      expect(sha256Hex(enc.encode(s)), `${n}바이트`).toBe(nodeHex(s))
    }
  })

  it('일본어(여러 바이트 문자)도 같다', () => {
    for (const s of ['がっこう', 'ちょうせんみんしゅしゅぎじんみんきょうわこく', '読めない']) {
      expect(sha256Hex(enc.encode(s))).toBe(nodeHex(s))
    }
  })
})

describe('audioName', () => {
  it('기본 사전의 모든 읽기에서 Node crypto 로 만든 이름과 같다', () => {
    const base = JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: { reading: string }[] }
    for (const { reading } of base.idioms) {
      const nfc = reading.normalize('NFC')
      expect(audioName(reading)).toBe(nodeHex(nfc).slice(0, 16) + '.mp3')
    }
  })
})
