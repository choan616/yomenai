// 백업과 학습 기록 초기화 — 설정에서 한 겹 들어간 화면 (2026-09-22).
//
// 설정 화면에서 떼어 낸 이유 둘.
// 1. **덩치.** 로그인·동기화·진행 막대까지 붙어 설정 본문의 절반을 먹었다
// 2. **위험.** 「학습 기록 초기화」는 되돌릴 수 없는데 스크롤하다 만나는 자리에 있었다
//    — 한 겹 안으로 들여 일부러 찾아 들어가게 한다
import { useEffect, useState, useSyncExternalStore } from 'react'
import { db } from '../db/schema.ts'
import { countUnsynced, LOCAL_USER_ID } from '../db/events.ts'
import { getDeviceId } from '../db/device.ts'
import { googleDrive } from '../sync/googleDrive.ts'
import { resetLearning, type SyncProgress } from '../sync/sync.ts'
import { syncRunner } from '../sync/syncRunner.ts'
import { clearIntroduced } from '../study/introduced.ts'
import { setSignedIn, wasSignedIn } from '../sync/syncState.ts'
import { clearDiagnosticDone } from './diagnostic-state.ts'
import { clearWelcomeSeen } from './welcome.ts'

function formatSyncTime(at: number): string {
  return new Date(at).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 동기화 단계를 사람 말로. 파일 수는 목록을 받아야 알 수 있어 그전까지 막대가 2단계로 잡힌다 */
function progressLabel(p: SyncProgress): string {
  switch (p.phase) {
    case 'list':
      return '백업 파일 확인 중…'
    case 'download':
      return p.file === undefined
        ? '백업 읽는 중…'
        : `백업 읽는 중 ${p.file.index}/${p.file.count}`
    case 'upload':
      return '내 기록 올리는 중…'
    case 'backup':
      return '백업 갱신 중…'
    case 'done':
      return '마무리하는 중…'
  }
}

/** Google Drive 백업 — 로그인 → 지금 동기화. 기기별 파일 분리라 충돌 UI가 없다 (PLAN §5 원칙 3) */
function BackupSetting() {
  const [authed, setAuthed] = useState(googleDrive.isAuthenticated())
  const [signInBusy, setSignInBusy] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  // 동기화 실행은 화면 밖(syncRunner)이 쥔다 — 이 화면을 나갔다 와도 진행·결과가 이어진다
  const run = useSyncExternalStore(syncRunner.subscribe, syncRunner.getState)
  const { lastSyncAt, progress, running: syncing } = run
  const busy = signInBusy || syncing
  const error = signInError ?? run.error
  /** 아직 안 올린 이 기기 기록 수 (2026-10-01). 계산 전엔 null */
  const [pending, setPending] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void countUnsynced(db(), LOCAL_USER_ID, getDeviceId(), lastSyncAt).then((n) => {
      if (alive) setPending(n)
    })
    return () => {
      alive = false
    }
  }, [lastSyncAt])

  /**
   * 전에는 설정에 들어오기만 해도 세션 복구를 시도했다. `prompt: ''` 라도 GIS 가
   * 조용히 못 풀면 **계정 선택 화면을 띄운다** — 설정을 열었을 뿐인데 구글 화면이 떴다
   * (사용자 지적 2026-09-14). 이제 복구도 버튼을 눌렀을 때만 한다.
   *
   * 대가는 전에 로그인했던 사람이 매번 한 번 누르는 것이다. 구글 화면이 불쑥 뜨는
   * 것보다는 낫다 — 누르는 건 의도한 행동이고, 뜨는 건 아니다.
   */
  const handleSignIn = () => {
    setSignInBusy(true)
    setSignInError(null)
    // 전에 동의한 세션이면 팝업 없이 풀린다. 안 풀릴 때만 구글 화면이 뜬다
    const attempt = wasSignedIn()
      ? googleDrive.restoreSession().then((ok) => (ok ? true : googleDrive.signIn()))
      : googleDrive.signIn()
    void attempt
      .then((ok) => {
        setAuthed(ok)
        setSignedIn(ok)
        if (!ok) setSignInError('로그인이 취소되었거나 실패했어요.')
      })
      .catch((err: unknown) => setSignInError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSignInBusy(false))
  }


  const handleSignOut = () => {
    googleDrive.signOut()
    setSignedIn(false)
    setAuthed(false)
  }

  const handleSync = () => {
    setSignInError(null)
    void syncRunner.start()
  }

  return (
    <div className="setting">
      <label>백업</label>
      {authed ? (
        <>
          <div className="seg" role="group" aria-label="백업">
            <button type="button" onClick={handleSync} disabled={busy}>
              {syncing ? '동기화 중…' : '지금 동기화'}
            </button>
            <button type="button" onClick={handleSignOut} disabled={busy}>
              로그아웃
            </button>
          </div>
          {progress === null ? (
            <span className="hint">
              {lastSyncAt === null ? '아직 동기화하지 않았어요.' : `마지막 동기화 ${formatSyncTime(lastSyncAt)}`}
              {pending !== null && pending > 0 && (
                <>
                  {' · '}
                  <b className="sync-pending">아직 안 올린 기록 {pending}건</b>
                </>
              )}
            </span>
          ) : (
            <div className="sync-progress">
              <progress value={progress.done} max={progress.total} aria-label="동기화 진행" />
              <span className="hint">{progressLabel(progress)}</span>
            </div>
          )}
          <span className="hint">
            {run.message ??
              'Drive 의 YomenaiSync 폴더에 backup.json 하나만 둬요. 동기화할 때마다 전체 기록이 거기 모여요.'}
          </span>
        </>
      ) : (
        <>
          <button type="button" onClick={handleSignIn} disabled={busy}>
            {signInBusy ? '로그인 중…' : wasSignedIn() ? 'Google 다시 연결' : 'Google로 로그인'}
          </button>
          <span className="hint">
            {wasSignedIn()
              ? '전에 연결해 두셨어요. 누르면 다시 이어져요 — 기록은 그대로 있어요.'
              : '기기 간 학습 기록을 Google Drive 로 백업해요.'}
          </span>
        </>
      )}
      {error !== null && <span className="hint error">{error}</span>}
    </div>
  )
}

/** 학습 기록 초기화 — 로컬 이벤트 로그 + Drive 백업 파일을 통째로 지운다. 되돌릴 수 없다 */
function ResetSetting() {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleReset = () => {
    setBusy(true)
    setError(null)
    // 소개 이력도 같이 비운다 — 기록을 지웠는데 "처음 만나요" 가 안 뜨면 앞뒤가 안 맞는다
    clearIntroduced()
    void resetLearning(db(), googleDrive)
      .then(() => {
        // 기록이 비었으니 진입 진단도 다시 받을 수 있어야 한다. 안 지우면 영영 안 뜬다
        clearDiagnosticDone()
        // 기록이 비었으면 처음 쓰는 상태다. 첫 안내도 다시 보여준다
        clearWelcomeSeen()
        // 세션 훅·홈 통계 등 곳곳의 파생 상태를 확실히 비우려고 통째로 새로고침한다
        window.location.reload()
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setBusy(false)
        setArmed(false)
      })
  }

  return (
    <div className="setting">
      <label>학습 기록 초기화</label>
      {armed ? (
        <div className="seg" role="group" aria-label="학습 기록 초기화 확인">
          <button type="button" className="danger" onClick={handleReset} disabled={busy}>
            {busy ? '초기화 중…' : '정말 초기화'}
          </button>
          <button type="button" onClick={() => setArmed(false)} disabled={busy}>
            취소
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setArmed(true)}>
          초기화
        </button>
      )}
      <span className="hint">
        이 기기의 학습 기록과{googleDrive.isAuthenticated() ? ' Google Drive 백업을' : ''} 지워요.
        되돌릴 수 없어요. 다른 기기에 남은 기록은 그 기기가 동기화할 때 다시 올라와요.
      </span>
      {error !== null && <span className="hint error">{error}</span>}
    </div>
  )
}

export function Backup({ onBack }: { onBack: () => void }) {
  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="돌아가기">
          ‹
        </button>
        <h2>백업과 기록</h2>
      </div>

      <div className="screen-body">
        <BackupSetting />
        <ResetSetting />
      </div>
    </section>
  )
}
