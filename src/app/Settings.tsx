// 설정 화면 — 세션 길이, 모드 비율, 백업. 값은 localStorage 에 즉시 저장 (PLAN §7)
import { useState } from 'react'
import {
  DEFAULT_SETTINGS,
  LIMIT_MAX,
  LIMIT_MIN,
  loadSettings,
  saveSettings,
  type Settings as SettingsData,
} from './settings.ts'
import { applyTheme, loadTheme, saveTheme, type Theme } from './theme.ts'
import { applyTextScale, loadTextScale, saveTextScale, type TextScale } from './textScale.ts'
import { openGuide } from './guide.ts'
import { db } from '../db/schema.ts'
import { getDeviceId } from '../db/device.ts'
import { googleDrive } from '../sync/googleDrive.ts'
import { resetLearning, syncNow, type SyncProgress } from '../sync/sync.ts'
import { clearIntroduced } from '../study/introduced.ts'
import { canVibrate } from '../study/keyFeedback.ts'
import { KEYPAD_LABEL, type KeypadLayout } from '../study/keypadLayouts.ts'
import { getLastSyncAt, setLastSyncAt, setSignedIn, wasSignedIn } from '../sync/syncState.ts'
import { clearDiagnosticDone } from './diagnostic-state.ts'
import { clearWelcomeSeen } from './welcome.ts'

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

const TEXT_SCALES: { label: string; value: TextScale }[] = [
  { label: '작게', value: 'sm' },
  { label: '기본', value: 'md' },
  { label: '크게', value: 'lg' },
]

const OBSERVE_LEVELS: { label: string; value: SettingsData['observeLevel'] }[] = [
  { label: '끔', value: 'off' },
  { label: '보통', value: 'normal' },
  { label: '자주', value: 'often' },
]

const KEYPAD_LAYOUTS: KeypadLayout[] = ['qwerty', 'compact', 'wide']

/** 자판 입력 피드백 (2026-09-19). 진동은 기기가 지원해야 고를 수 있다 */
const KEY_FEEDBACKS: { label: string; value: SettingsData['keyFeedback'] }[] = [
  { label: '없음', value: 'off' },
  { label: '소리', value: 'sound' },
  { label: '진동', value: 'haptic' },
]

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
  const [busy, setBusy] = useState<'idle' | 'signIn' | 'sync'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSyncAt, setLastSyncAtState] = useState<number | null>(getLastSyncAt)
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [syncMsg, setSyncMsg] = useState<string | null>(null)

  /**
   * 전에는 설정에 들어오기만 해도 세션 복구를 시도했다. `prompt: ''` 라도 GIS 가
   * 조용히 못 풀면 **계정 선택 화면을 띄운다** — 설정을 열었을 뿐인데 구글 화면이 떴다
   * (사용자 지적 2026-09-14). 이제 복구도 버튼을 눌렀을 때만 한다.
   *
   * 대가는 전에 로그인했던 사람이 매번 한 번 누르는 것이다. 구글 화면이 불쑥 뜨는
   * 것보다는 낫다 — 누르는 건 의도한 행동이고, 뜨는 건 아니다.
   */
  const handleSignIn = () => {
    setBusy('signIn')
    setError(null)
    // 전에 동의한 세션이면 팝업 없이 풀린다. 안 풀릴 때만 구글 화면이 뜬다
    const attempt = wasSignedIn()
      ? googleDrive.restoreSession().then((ok) => (ok ? true : googleDrive.signIn()))
      : googleDrive.signIn()
    void attempt
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
    setProgress(null)
    setSyncMsg(null)
    void syncNow(db(), getDeviceId(), googleDrive, setProgress)
      .then(({ restored, backupTotal }) => {
        const now = Date.now()
        setLastSyncAt(now)
        setLastSyncAtState(now)
        // 무슨 일이 있었는지 알린다 — 조용히 넘기면 기록이 늘거나 준 이유를 모른다
        setSyncMsg(
          restored > 0
            ? `이 기기에 없던 기록 ${restored}건을 백업에서 되살렸어요. 백업에 모두 ${backupTotal}건.`
            : `백업에 모두 ${backupTotal}건 있어요.`,
        )
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        setBusy('idle')
        setProgress(null)
      })
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
          {progress === null ? (
            <span className="hint">
              {lastSyncAt === null ? '아직 동기화하지 않았어요.' : `마지막 동기화 ${formatSyncTime(lastSyncAt)}`}
            </span>
          ) : (
            <div className="sync-progress">
              <progress value={progress.done} max={progress.total} aria-label="동기화 진행" />
              <span className="hint">{progressLabel(progress)}</span>
            </div>
          )}
          <span className="hint">
            {syncMsg ??
              'Drive 의 YomenaiSync 폴더에 backup.json 하나만 둬요. 동기화할 때마다 전체 기록이 거기 모여요.'}
          </span>
        </>
      ) : (
        <>
          <button type="button" onClick={handleSignIn} disabled={busy !== 'idle'}>
            {busy === 'signIn' ? '로그인 중…' : wasSignedIn() ? 'Google 다시 연결' : 'Google로 로그인'}
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

export function Settings({
  onFeedback,
}: {
  /** 테스터 피드백 화면으로 (2026-09-13) */
  onFeedback: () => void
}) {
  const [settings, setSettings] = useState<SettingsData>(loadSettings)
  const [theme, setThemeState] = useState<Theme>(loadTheme)
  const [textScale, setTextScaleState] = useState<TextScale>(loadTextScale)

  const update = (next: SettingsData) => {
    setSettings(next)
    saveSettings(next)
  }

  const setTheme = (next: Theme) => {
    setThemeState(next)
    saveTheme(next)
    applyTheme(next)
  }

  const setTextScale = (next: TextScale) => {
    setTextScaleState(next)
    saveTextScale(next)
    applyTextScale(next)
  }

  const setLimit = (delta: number) =>
    update({
      ...settings,
      sessionLimit: Math.min(LIMIT_MAX, Math.max(LIMIT_MIN, settings.sessionLimit + delta)),
    })

  return (
    <section className="screen">
      <div className="screen-bar">
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
          <label>글자 크기</label>
          <div className="seg" role="group" aria-label="글자 크기">
            {TEXT_SCALES.map((s) => (
              <button
                key={s.value}
                type="button"
                aria-pressed={textScale === s.value}
                onClick={() => setTextScale(s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <span className="hint">
            탭바·리포트·설정·찾기 같은 화면 글자예요. 학습 카드의 숙어·읽기는 안 바뀌어요.
          </span>
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

        <div className="setting">
          <label>자판 배열</label>
          <div className="seg" role="group" aria-label="자판 배열">
            {KEYPAD_LAYOUTS.map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={settings.keypadLayout === o}
                onClick={() => update({ ...settings, keypadLayout: o })}
              >
                {KEYPAD_LABEL[o]}
              </button>
            ))}
          </div>
          <span className="hint">
            일본어 읽기에 안 쓰이는 l·q·v·x 를 뺀 배열이에요 (읽기 10만여 개에서 0회).
            「간결」은 자리를 그대로 두고 넷만 빼고, 「넓게」는 8키씩 나눠 키가 제일 커요.
          </span>
        </div>

        <div className="setting">
          <label>자판 입력 피드백</label>
          <div className="seg" role="group" aria-label="자판 입력 피드백">
            {KEY_FEEDBACKS.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={settings.keyFeedback === o.value}
                disabled={o.value === 'haptic' && !canVibrate()}
                onClick={() => update({ ...settings, keyFeedback: o.value })}
              >
                {o.label}
              </button>
            ))}
          </div>
          <span className="hint">
            앱 자판(손가락 기기)에만 적용돼요.
            {canVibrate()
              ? ' 소리는 기기가 무음이면 안 들려요.'
              : ' 이 기기는 진동을 못 써요 — iOS 는 웹에 진동 기능이 없어요. 소리도 기기가 무음이면 안 들려요.'}
          </span>
        </div>

        <BackupSetting />

        <div className="setting">
          <label>안내서</label>
          <button type="button" onClick={openGuide}>
            사용 안내서 열기 ›
          </button>
          <span className="hint">
            이 앱이 무엇을 왜 다루는지, 리포트를 어떻게 읽는지 정리해 뒀어요.
          </span>
        </div>

        <div className="setting">
          <label>피드백</label>
          <button type="button" onClick={onFeedback}>
            피드백 보내기 ›
          </button>
          <span className="hint">
            써 보신 소감을 여쭙습니다. 학습 기록은 보내지 않고, 적으신 답만 갑니다.
          </span>
        </div>

        <ResetSetting />
      </div>
    </section>
  )
}
