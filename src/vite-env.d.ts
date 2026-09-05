/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Google Drive 백업 로그인용 OAuth 클라이언트 ID (Phase 7, .env 참조) */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
