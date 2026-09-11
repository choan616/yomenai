// 설정 화면 — 세션 길이, 모드 비율, 백업. 값은 localStorage 에 즉시 저장 (PLAN §7)
import { useEffect, useState } from 'react'
import {
  DEFAULT_SETTINGS,
  LIMIT_MAX,
  LIMIT_MIN,
  loadSettings,
  saveSettings,
  type Settings as SettingsData,
} from './settings.ts'
import { applyTheme, loadTheme, saveTheme, type Theme } from './theme.ts'
import { db } from '../db/schema.ts'
import { getDeviceId } from '../db/device.ts'
import { googleDrive } from '../sync/googleDrive.ts'
import { consolidateSyncFiles, resetLearning, syncNow } from '../sync/sync.ts'
import { getLastSyncAt, setLastSyncAt, setSignedIn, wasSignedIn } from '../sync/syncState.ts'
import { clearDiagnosticDone } from './diagnostic-state.ts'

const STEP = 5

const RATIO_PRESETS: { label: string; value: SettingsData['ratio'] }[] = [
  { label: '7 : 3', value: { correction: 7, expansion: 3 } },
  { label: '5 : 5', value: { correction: 5, expansion: 5 } },
  { label: '읽기만', value: { correction: 10, expansion: 0 } },
]

function sameRatio(a: SettingsData['ratio'], b: SettingsData['ratio']): boolean {
  return a.correction === b.correction && a.expansion === b.expansion
}

const THEMES: { label: string; value: Theme }[] = [
  { label: '시스템', value: 'system' },
  { label: '라이트', value: 'light' },
  { label: '다크', value: 'dark' },
]

const OBSERVE_LEVELS: { label: string; value: SettingsData['observeLevel'] }[] = [
  { label: '끔', value: 'off' },
  { label: '보통', value: 'normal' },
  { label: '자주', value: 'often' },
]

function formatSyncTime(at: number): string {
  return new Date(at).toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Google Drive 백업 — 로그인 → 지금 동기화. 기기별 파일 분리라 충돌 UI가 없다 (PLAN §5 원칙 3) */
function BackupSetting() {
  const [authed, setAuthed] = useState(googleDrive.isAuthenticated())
  const [busy, setBusy] = useState<'idle' | 'signIn' | 'sync'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(getLastSyncAt)
  const [cleanup, setCleanup] = useState<'idle' | 'armed' | 'busy'>('idle')
  const [cleanupMsg, setCleanupMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!wasSignedIn() || authed) return
    void googleDrive.restoreSession().then((ok) => {
      if (ok) setAuthed(true)
    })
    // authed 가 바뀌면 재평가되지만 guard 가 바로 막아 실질적으로 1회만 시도한다
  }, [authed])

  const handleSignIn = () => {
    setBusy('signIn')
    setError(null)
    void googleDrive
      .signIn()
      .then((ok) => {
        setAuthed(ok)
        setSignedIn(ok)
        if (!ok) setError('로그인이 취소되었거나 실패했어요.')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy('idle'))
  }

  const handleSignOut = () => {
    googleDrive.signOut()
    setSignedIn(false)
    setAuthed(false)
  }

  const handleSync = () => {
    setBusy('sync')
    setError(null)
    void syncNow(db(), getDeviceId())
      .then(() => {
        const now = Date.now()
        setLastSyncAt(now)
        setLastSyncAtState(now)
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy('idle'))
  }

  // 옛 기기 파일 정리 — 합친 뒤에 지우므로 기록은 안 사라지지만 Drive 파일을 삭제하니 확인을 받는다
  const handleCleanup = () => {
    setCleanup('busy')
    setError(null)
    setCleanupMsg(null)
    void consolidateSyncFiles(db(), getDeviceId())
      .then(({ archived, removed }) => {
        setCleanupMsg(
          removed === 0
            ? '정리할 옛 기기 파일이 없어요.'
            : `옛 기기 파일 ${removed}개를 보관 파일 하나로 합쳤어요. 기록 ${archived}건은 그대로예요.`,
        )
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setCleanup('idle'))
  }

  return (
    <div className="setting">
      <label>백업</label>
      {authed ? (
        <>
          <div className="seg" role="group" aria-label="백업">
            <button type="button" onClick={handleSync} disabled={busy !== 'idle'}>
              {busy === 'sync' ? '동기화 중…' : '지금 동기화'}
            </button>
            <button type="button" onClick={handleSignOut} disabled={busy !== 'idle'}>
              로그아웃
            </button>
          </div>
          <span className="hint">
            {lastSyncAt === null ? '아직 동기화하지 않았어요.' : `마지막 동기화 ${formatSyncTime(lastSyncAt)}`}
          </span>
          {cleanup === 'armed' ? (
            <div className="seg" role="group" aria-label="옛 기기 파일 정리 확인">
              <button type="button" className="danger" onClick={handleCleanup}>
                정말 정리
              </button>
              <button type="button" onClick={() => setCleanup('idle')}>
                취소
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCleanup('armed')}
              disabled={busy !== 'idle' || cleanup === 'busy'}
            >
              {cleanup === 'busy' ? '정리 중…' : '옛 기기 파일 정리'}
            </button>
          )}
          <span className="hint">
            {cleanupMsg ??
              '브라우저 데이터를 지우면 새 기기로 잡혀 백업 파일이 쌓여요. 안 쓰는 파일을 보관 파일 하나로 합쳐요.'}
          </span>
        </>
      ) : (
        <>
          <button type="button" onClick={handleSignIn} disabled={busy !== 'idle'}>
            {busy === 'signIn' ? '로그인 중…' : 'Google로 로그인'}
          </button>
          <span className="hint">기기 간 학습 기록을 Google Drive 로 백업해요.</span>
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
    void resetLearning(db(), googleDrive)
      .then(() => {
        // 기록이 비었으니 진입 진단도 다시 받을 수 있어야 한다. 안 지우면 영영 안 뜬다
        clearDiagnosticDone()
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
        이 기기의 학습 기록과{googleDrive.isAuthenticated() ? ' Google Drive 백업을' : ''} 모두 지워요.
        되돌릴 수 없어요.
      </span>
      {error !== null && <span className="hint error">{error}</span>}
    </div>
  )
}

export function Settings({ onBack }: { onBack: () => void }) {
  const [settings, setSettings] = useState<SettingsData>(loadSettings)
  const [theme, setThemeState] = useState<Theme>(loadTheme)

  const update = (next: SettingsData) => {
    setSettings(next)
    saveSettings(next)
  }

  const setTheme = (next: Theme) => {
    setThemeState(next)
    saveTheme(next)
    applyTheme(next)
  }

  const setLimit = (delta: number) =>
    update({
      ...settings,
      sessionLimit: Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, settings.sessionLimit + delta)),
    })

  return (
    <section className="screen">
      <div className="screen-bar">
        <button type="button" className="back" onClick={onBack} aria-label="홈으로">
          ←
        </button>
        <h2>설정</h2>
      </div>

      <div className="screen-body">
        <div className="setting">
          <label htmlFor="session-len">세션 길이</label>
          <div className="stepper" id="session-len">
            <button
              type="button"
              onClick={() => setLimit(-STEP)}
              disabled={settings.sessionLimit <= LIMIT_MIN}
              aria-label="세션 길이 줄이기"
            >
              −
            </button>
            <span className="val">{settings.sessionLimit}장</span>
            <button
              type="button"
              onClick={() => setLimit(STEP)}
              disabled={settings.sessionLimit >= LIMIT_MAX}
              aria-label="세션 길이 늘리기"
            >
              +
            </button>
          </div>
          <span className="hint">
            한 세션에 낼 카드 수 ({LIMIT_MIN}~{LIMIT_MAX}). 기본 {DEFAULT_SETTINGS.sessionLimit}
          </span>
        </div>

        <div className="setting">
          <label>모드 비율 (읽기 교정 : 어휘 확장)</label>
          <div className="seg" role="group" aria-label="모드 비율">
            {RATIO_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                aria-pressed={sameRatio(settings.ratio, p.value)}
                onClick={() => update({ ...settings, ratio: p.value })}
              >
                {p.label}
              </button>
            ))}
          </div>
          <span className="hint">한쪽 정원이 비면 다른 쪽이 채워요. 기본 7 : 3</span>
        </div>

        <div className="setting">
          <label>테마</label>
          <div className="seg" role="group" aria-label="테마">
            {THEMES.map((t) => (
              <button
                key={t.value}
                type="button"
                aria-pressed={theme === t.value}
                onClick={() => setTheme(t.value)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="hint">시스템은 기기 설정을 따라요.</span>
        </div>

        <div className="setting">
          <label>관찰 문구</label>
          <div className="seg" role="group" aria-label="관찰 문구">
            {OBSERVE_LEVELS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={settings.observeLevel === o.value}
                onClick={() => update({ ...settings, observeLevel: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hint">세션 중 "지난번엔 틀렸는데 이번엔 맞혔어요" 같은 한 줄. 기본은 보통이에요.</span>
        </div>

        <BackupSetting />
        <ResetSetting />
      </div>
    </section>
  )
}
