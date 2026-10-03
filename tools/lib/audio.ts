// 읽기 음성 파일 이름과 변환 규칙 — 합성 도구와 (뒤에 붙을) 재생 엔진이 같은 규칙을 쓰도록 한곳에 둔다
import { audioName } from '../../src/lib/audioName.ts'

export { audioName }

/** 음성 파일 형식. 24kHz 모노 MP3 32kbps (context-notes 2026-10-03 「일단 32k」) */
export const AUDIO_FORMAT = 'mp3-24k-mono-32k'

/** 중복을 뺀 읽기 목록 (NFC 기준, 가나 순). 동음이의어는 한 파일을 나눈다 */
export function uniqueReadings(items: readonly { reading: string }[]): string[] {
  const set = new Set<string>()
  for (const it of items) {
    const r = it.reading.normalize('NFC').trim()
    if (r !== '') set.add(r)
  }
  return [...set].sort()
}

/** 엔진이 내는 WAV 를 표준입력으로 받아 MP3 를 표준출력으로 내는 ffmpeg 인자 */
export const FFMPEG_ARGS = [
  '-v', 'error',
  '-f', 'wav', '-i', 'pipe:0',
  '-ac', '1',
  '-c:a', 'libmp3lame', '-b:a', '32k',
  '-f', 'mp3', 'pipe:1',
]
