/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Google Drive 백업 로그인용 OAuth 클라이언트 ID (Phase 7, .env 참조) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** 읽기 음성 파일 주소의 앞부분(voiceFiles.ts). 빈 문자열이면 음성 파일을 쓰지 않는다 */
  readonly VITE_AUDIO_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
