// Google Drive 에 기기별 동기화 파일을 읽고 쓰는 최소 클라이언트.
// gapi 클라이언트 라이브러리는 안 쓴다 — Google Identity Services(GIS)로 얻은 토큰으로
// Drive REST 를 fetch 로 직접 호출한다 (mmtm 대비 스크립트 1개만 로드, context-notes 참조).
// 스코프는 drive.file — 이 앱이 만든 파일만 건드릴 수 있다.

/**
 * .env·CI secret 에 URL 형태(`https://…/`)로 잘못 넣어도 동작하도록 스킴·공백·끝 슬래시를
 * 벗긴다. 맨몸 client_id 가 아니면 Google 이 invalid_client 로 막는다 (한 번 겪음)
 */
export function normalizeClientId(raw: string | undefined): string | undefined {
  return raw?.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '') || undefined
}

const CLIENT_ID = normalizeClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID)
const SCOPE = 'https://www.googleapis.com/auth/drive.file'
const FOLDER_NAME = 'YomenaiSync'
const GIS_SRC = 'https://accounts.google.com/gsi/client'
const DRIVE_API = 'https://www.googleapis.com/drive/v3'
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3'

interface TokenResponse {
  access_token: string
  expires_in: number
  error?: string
}

interface TokenClient {
  callback: (r: TokenResponse) => void
  requestAccessToken(opts: { prompt: string; login_hint?: string }): void
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(cfg: {
            client_id: string
            scope: string
            callback: (r: TokenResponse) => void
          }): TokenClient
          revoke(token: string, cb: () => void): void
        }
      }
    }
  }
}

export interface DriveFileMeta {
  id: string
  name: string
}

/** sync.ts 가 실제 구현 대신 주입할 수 있는 형태. 테스트는 이 인터페이스만 흉내 낸다 */
export interface DriveClient {
  isAuthenticated(): boolean
  signIn(): Promise<boolean>
  restoreSession(): Promise<boolean>
  signOut(): void
  listSyncFiles(): Promise<DriveFileMeta[]>
  downloadFile(fileId: string): Promise<string>
  uploadOrReplace(fileName: string, content: string): Promise<void>
}

let tokenClient: TokenClient | null = null
let accessToken: string | null = null
let tokenExpiresAt = 0
let gisLoaded: Promise<void> | null = null
let folderIdCache: string | null = null

function loadGis(): Promise<void> {
  gisLoaded ??= new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Google 로그인 스크립트 로드 실패'))
    document.head.appendChild(script)
  })
  return gisLoaded
}

async function ensureTokenClient(): Promise<TokenClient> {
  if (!CLIENT_ID) {
    throw new Error('VITE_GOOGLE_CLIENT_ID 가 설정되지 않았습니다. .env 를 확인하세요')
  }
  await loadGis()
  tokenClient ??= window.google!.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: () => {}, // 요청마다 아래에서 덮어쓴다
  })
  return tokenClient
}

function isAuthenticated(): boolean {
  return accessToken !== null && Date.now() < tokenExpiresAt
}

async function requestToken(prompt: string): Promise<boolean> {
  const client = await ensureTokenClient()
  return new Promise<boolean>((resolve) => {
    client.callback = (resp) => {
      if (resp.error) {
        resolve(false)
        return
      }
      accessToken = resp.access_token
      tokenExpiresAt = Date.now() + (resp.expires_in - 60) * 1000 // 60초 여유
      resolve(true)
    }
    client.requestAccessToken({ prompt })
  })
}

async function signIn(): Promise<boolean> {
  return requestToken(isAuthenticated() ? '' : 'consent')
}

/** 이전에 동의한 세션이면 팝업 없이 토큰을 다시 얻는다. 실패해도 조용히 false */
async function restoreSession(): Promise<boolean> {
  try {
    return await requestToken('')
  } catch {
    return false
  }
}

function signOut(): void {
  if (accessToken && window.google) {
    window.google.accounts.oauth2.revoke(accessToken, () => {})
  }
  accessToken = null
  tokenExpiresAt = 0
  folderIdCache = null
}

function authHeaders(extra?: Record<string, string>): HeadersInit {
  if (!accessToken) throw new Error('로그인이 필요합니다')
  return { Authorization: `Bearer ${accessToken}`, ...extra }
}

async function findOrCreateFolder(): Promise<string> {
  if (folderIdCache) return folderIdCache
  const q = encodeURIComponent(
    `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  )
  const listRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)&spaces=drive`, {
    headers: authHeaders(),
  })
  if (!listRes.ok) throw new Error(`Drive 폴더 조회 실패: ${listRes.status}`)
  const found = (await listRes.json()) as { files: { id: string }[] }
  if (found.files.length > 0) {
    folderIdCache = found.files[0].id
    return folderIdCache
  }

  const createRes = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  })
  if (!createRes.ok) throw new Error(`Drive 폴더 생성 실패: ${createRes.status}`)
  const created = (await createRes.json()) as { id: string }
  folderIdCache = created.id
  return folderIdCache
}

async function listSyncFiles(): Promise<DriveFileMeta[]> {
  const folderId = await findOrCreateFolder()
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false and name contains 'reviews-'`)
  const res = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)&spaces=drive`, {
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Drive 파일 목록 조회 실패: ${res.status}`)
  const body = (await res.json()) as { files: DriveFileMeta[] }
  return body.files
}

async function downloadFile(fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: authHeaders(),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Drive 파일 다운로드 실패: ${res.status}`)
  return res.text()
}

async function uploadOrReplace(fileName: string, content: string): Promise<void> {
  const folderId = await findOrCreateFolder()
  const existing = await listSyncFiles()
  const match = existing.find((f) => f.name === fileName)

  if (match) {
    const res = await fetch(`${DRIVE_UPLOAD}/files/${match.id}?uploadType=media`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: content,
    })
    if (!res.ok) throw new Error(`Drive 파일 갱신 실패: ${res.status}`)
    return
  }

  const form = new FormData()
  form.append('metadata', new Blob([JSON.stringify({ name: fileName, parents: [folderId] })], { type: 'application/json' }))
  form.append('file', new Blob([content], { type: 'application/json' }))
  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) throw new Error(`Drive 파일 생성 실패: ${res.status}`)
}

export const googleDrive: DriveClient = {
  isAuthenticated,
  signIn,
  restoreSession,
  signOut,
  listSyncFiles,
  downloadFile,
  uploadOrReplace,
}
