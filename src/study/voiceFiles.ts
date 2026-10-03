// 미리 합성한 읽기 음성 파일(VOICEVOX) — 음성 목록과 호스팅 주소. 합성은 tools/build-audio.ts
//
// 파일은 이 저장소 밖(`choan616/yomenai-audio` 의 Pages)에 있다 (context-notes 2026-10-03). 앱과 같은 오리진의
// 다른 경로라 CORS 가 없고, 서비스 워커가 런타임 캐시에 담는다.

export interface FileVoice {
  /** `ttsPrefs.voice` 에 저장되는 값 — 기기 음성의 `voiceURI` 와 겹치지 않게 접두어를 둔다 */
  id: string
  /** 호스팅 폴더 이름 */
  key: string
  /** 설정에 보이는 이름 */
  label: string
  /** 규약이 요구하는 크레딧 표기 — 설정 화면에 보인다 */
  credit: string
}

export const FILE_VOICES: readonly FileVoice[] = [
  { id: 'file:kurono', key: 'kurono', label: '음성 파일 · 玄野武宏', credit: 'VOICEVOX:玄野武宏(CV:ガロ)' },
  { id: 'file:metan', key: 'metan', label: '음성 파일 · 四国めたん', credit: 'VOICEVOX:四国めたん' },
]

/** 설정이 「자동」일 때 쓰는 음성 (사용자 결정 2026-10-03 「기본 1」) */
export const DEFAULT_FILE_VOICE: FileVoice = FILE_VOICES[0]!

/**
 * 음성 파일 주소의 앞부분. 빈 문자열이면 음성 파일을 쓰지 않는다 — 개발 서버와 e2e 의 기본이다.
 * 프로덕션 기본은 같은 오리진의 `/yomenai-audio`. 개발 빌드에서는 `localStorage['yomenai:audioBase']` 로 덮어
 * e2e 가 가짜 주소를 건네고, 프로덕션 빌드에서는 이 분기가 사라진다.
 */
export function audioBase(): string {
  if (import.meta.env.DEV) {
    try {
      const o = localStorage.getItem('yomenai:audioBase')
      if (o !== null) return o
    } catch {
      /* 저장소가 막혔으면 기본값 */
    }
  }
  return import.meta.env.VITE_AUDIO_BASE ?? (import.meta.env.PROD ? '/yomenai-audio' : '')
}

/** 저장된 음성 값 → 쓸 파일 음성. 기기 음성을 골랐거나 파일을 안 쓰는 환경이면 null */
export function fileVoiceFor(voice: string, base: string): FileVoice | null {
  if (base === '') return null
  if (voice === '') return DEFAULT_FILE_VOICE
  if (!voice.startsWith('file:')) return null
  return FILE_VOICES.find((v) => v.id === voice) ?? DEFAULT_FILE_VOICE
}
