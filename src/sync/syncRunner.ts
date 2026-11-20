// 동기화 실행·진행·결과를 화면 밖에서 쥐고, 숨은 사이 끊긴 실행을 돌아오면 한 번 이어 하는 러너
//
// 전에는 이 상태가 `Backup.tsx` 의 useState 라 화면을 나가면 막대·결과가 사라지고, 돌아오면
// 버튼이 풀려 두 번째 동기화를 시작할 수 있었다. 요청(`syncNow`)은 화면과 무관하게 끝까지 간다.
//
// 이어 하기는 **끊긴 것만** 이어 한다 — 주기·진입 시 자동 동기화가 아니다(2026-10-01 기각 유지).
// 구글 창은 안 띄운다: 토큰이 살아 있을 때만 다시 돌린다(2026-09-14 결정).
import { getDeviceId } from '../db/device.ts'
import { db } from '../db/schema.ts'
import { googleDrive } from './googleDrive.ts'
import { syncNow, type SyncProgress, type SyncResult } from './sync.ts'
import { getLastSyncAt, setLastSyncAt } from './syncState.ts'

export interface SyncRunState {
  running: boolean
  progress: SyncProgress | null
  /** 마지막 실행이 잘 끝났을 때의 안내 문구. 다음 실행이 시작되면 지운다 */
  message: string | null
  error: string | null
  lastSyncAt: number | null
}

export interface SyncRunnerDeps {
  run: (onProgress: (p: SyncProgress) => void) => Promise<SyncResult>
  isAuthenticated: () => boolean
  now: () => number
  saveLastSyncAt: (at: number) => void
  initialLastSyncAt: number | null
}

export const INTERRUPTED_MESSAGE = '앱을 벗어난 사이 동기화가 끊겼어요.'

export function createSyncRunner(deps: SyncRunnerDeps) {
  let state: SyncRunState = {
    running: false,
    progress: null,
    message: null,
    error: null,
    lastSyncAt: deps.initialLastSyncAt,
  }
  const listeners = new Set<() => void>()
  let current: Promise<void> | null = null
  let hiddenDuringRun = false
  let interrupted = false

  const set = (patch: Partial<SyncRunState>) => {
    state = { ...state, ...patch }
    for (const l of listeners) l()
  }

  function start(): Promise<void> {
    if (current !== null) return current
    hiddenDuringRun = false
    interrupted = false
    // 기준 시각은 **시작** 시각이다 (2026-10-01) — 도중에 생긴 기록을 「올린 것」으로 세지 않으려고
    const startedAt = deps.now()
    set({ running: true, progress: null, message: null, error: null })
    current = deps
      .run((progress) => set({ progress }))
      .then(({ restored, backupTotal }) => {
        deps.saveLastSyncAt(startedAt)
        // 무슨 일이 있었는지 알린다 — 조용히 넘기면 기록이 늘거나 준 이유를 모른다
        set({
          lastSyncAt: startedAt,
          message:
            restored > 0
              ? `이 기기에 없던 기록 ${restored}건을 백업에서 되살렸어요. 백업에 모두 ${backupTotal}건.`
              : `백업에 모두 ${backupTotal}건 있어요.`,
        })
      })
      .catch((err: unknown) => {
        if (hiddenDuringRun) {
          interrupted = true
          set({ error: INTERRUPTED_MESSAGE })
        } else {
          set({ error: err instanceof Error ? err.message : String(err) })
        }
      })
      .finally(() => {
        current = null
        set({ running: false, progress: null })
      })
    return current
  }

  return {
    start,
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 앱이 숨었다 — 그때 돌고 있던 실행이 실패하면 「끊김」으로 본다 */
    noteHidden() {
      if (current !== null) hiddenDuringRun = true
    },
    /** 앱으로 돌아왔다 — 끊긴 실행이 있고 토큰이 살아 있으면 한 번 이어 한다 */
    resumeIfInterrupted() {
      if (!interrupted || current !== null || !deps.isAuthenticated()) return
      void start()
    },
  }
}

export const syncRunner = createSyncRunner({
  run: (onProgress) => syncNow(db(), getDeviceId(), googleDrive, onProgress),
  isAuthenticated: () => googleDrive.isAuthenticated(),
  now: () => Date.now(),
  saveLastSyncAt: setLastSyncAt,
  initialLastSyncAt: getLastSyncAt(),
})

/** 앱 셸이 한 번 건다. 해제 함수를 돌려준다 */
export function installSyncResume(runner = syncRunner): () => void {
  const onChange = () => {
    if (document.visibilityState === 'hidden') runner.noteHidden()
    else runner.resumeIfInterrupted()
  }
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
