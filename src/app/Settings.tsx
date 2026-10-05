// 설정 화면 — 값은 localStorage 에 즉시 저장 (PLAN §7).
//
// **묶어서 낸다** (2026-09-22 사용자 요청 "필요할 때마다 더해서 산만하다"). 필요할 때마다
// 한 줄씩 붙인 탓에 13개가 평평하게 늘어서 있었고 순서가 의미순이 아니라 추가된 순서였다.
// 학습 / 세션 중 / 입력 / 보기 로 묶고, **값을 고르는 것**과 **다른 화면으로 가는 것**을
// 선으로 갈랐다 — 둘이 똑같이 생겨서 「안내서」도 설정처럼 보였다.
//
// 백업과 초기화는 `Backup.tsx` 로 뺐다. 덩치가 본문의 절반이었고, 되돌릴 수 없는 초기화가
// 스크롤하다 만나는 자리에 있었다
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { countUnsynced, LOCAL_USER_ID } from '../db/events.ts'
import { db } from '../db/schema.ts'
import { getDeviceId } from '../db/device.ts'
import { getLastSyncAt, wasSignedIn } from '../sync/syncState.ts'
import { loadReviewMode, saveReviewMode, UNLOCK_HOLD_MS } from './reviewMode.ts'
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
import { canVibrate } from '../study/keyFeedback.ts'
import { KEYPAD_LABEL, type KeypadLayout } from '../study/keypadLayouts.ts'
import { tts, type TtsVoice } from '../study/tts.ts'
import { BottomSheet } from './BottomSheet.tsx'
import { StepSlider } from './StepSlider.tsx'
import { loadTtsPrefs, RATE_LABEL, RATES, saveTtsPrefs, type TtsPrefs } from '../study/ttsPrefs.ts'
import { audioBase, FILE_VOICES, fileVoiceFor } from '../study/voiceFiles.ts'

/**
 * 「들어보기」에 읽는 말. 소리가 어색한 세 곳이 한 낱말에 다 든다 — 맨 앞의 탁음(が), 촉음(っ), 장음(こう).
 * 보정을 켜고 끄며 비교할 때 같은 말을 듣게 한다
 */
const TTS_SAMPLE = 'がっこう'

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

const KEYPAD_LAYOUTS: KeypadLayout[] = ['qwerty', 'compact']

/** 다시보기 요미가나 가리기 (2026-09-21 사용자 요청) */
const BROWSE_MASKS: { label: string; value: boolean }[] = [
  { label: '가림', value: true },
  { label: '안 가림', value: false },
]

/** 키보드 선택 (2026-09-30). 기기 키보드는 받아쓰기·음성 제어 같은 기기 입력 기능을 쓰는 길이다 */
const KEYBOARDS: { label: string; value: SettingsData['keyboard'] }[] = [
  { label: '앱 자판', value: 'app' },
  { label: '기기 키보드', value: 'system' },
]

/** 자판 입력 피드백 (2026-09-19). 진동은 기기가 지원해야 고를 수 있다 */
const KEY_FEEDBACKS: { label: string; value: SettingsData['keyFeedback'] }[] = [
  { label: '없음', value: 'off' },
  { label: '소리', value: 'sound' },
  { label: '진동', value: 'haptic' },
]


export function Settings({
  onClose,
  onFeedback,
  onIntro,
  onBackup,
  onReview,
}: {
  /** 시트를 닫는다 — 설정 탭을 누르기 전 탭으로 돌아간다 (2026-10-04) */
  onClose: () => void
  /** 뜻 검수 화면으로. 검수 모드를 켠 기기에서만 보인다 (2026-09-24) */
  onReview: () => void
  /** 테스터 피드백 화면으로 (2026-09-13) */
  onFeedback: () => void
  /** 시작 인트로를 다시 본다 (2026-10-05 사용자 「한 번 짧게 봐서 다시 못 보니 모르겠다」). 홈으로 가서 재생한다 */
  onIntro: () => void
  /** 백업·초기화 화면으로 (2026-09-22) */
  onBackup: () => void
}) {
  const [settings, setSettings] = useState<SettingsData>(loadSettings)
  /** 소리 취향 (2026-10-03) — 기기 값이라 `settings` 와 따로 둔다. 음성 목록은 비동기로 채워진다 */
  const [ttsPrefs, setTtsPrefsState] = useState<TtsPrefs>(loadTtsPrefs)
  const [voices, setVoices] = useState<TtsVoice[]>(() => tts.voices())
  // 처음 값은 위 초기화가 읽는다. 여기는 늦게 채워지는 목록을 구독만 한다
  useEffect(() => tts.onVoicesChanged(() => setVoices(tts.voices())), [])
  /** 지금 소리를 내는 음성 파일. 기기 음성을 골랐거나 음성 파일을 안 쓰는 환경이면 null */
  const fileVoice = fileVoiceFor(ttsPrefs.voice, audioBase())
  const setTtsPrefs = (next: TtsPrefs) => {
    saveTtsPrefs(next)
    setTtsPrefsState(next)
  }
  const [theme, setThemeState] = useState<Theme>(loadTheme)
  const [textScale, setTextScaleState] = useState<TextScale>(loadTextScale)
  /** 아직 동기화로 안 올린 이 기기 기록 수 (2026-10-01). 동기화를 연결한 적 없으면 0 으로 둔다 */
  const [unsynced, setUnsynced] = useState(0)
  useEffect(() => {
    if (!wasSignedIn()) return
    let alive = true
    void countUnsynced(db(), LOCAL_USER_ID, getDeviceId(), getLastSyncAt()).then((n) => {
      if (alive) setUnsynced(n)
    })
    return () => {
      alive = false
    }
  }, [])
  /**
   * 검수 모드 — **숨은 진입**이다 (2026-09-24). 「보기」 묶음 제목을 길게 누르면 열린다.
   * 인증이 아니라 정돈이다 — 보통 학습자에게 검수 도구를 안 보여 주는 것까지가 목적이고,
   * 검수 결과는 내 Drive 파일을 빌드에 넣을 때만 사전에 닿는다 (`reviewMode.ts`)
   */
  const [review, setReview] = useState(loadReviewMode)
  const hold = useRef<number | null>(null)
  const startHold = () => {
    if (review) return
    hold.current = window.setTimeout(() => {
      setReview(true)
      saveReviewMode(true)
    }, UNLOCK_HOLD_MS)
  }
  const endHold = () => {
    if (hold.current !== null) window.clearTimeout(hold.current)
    hold.current = null
  }

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

  return (
    <BottomSheet title="설정" onClose={onClose}>
        {/* 값을 고르는 게 아니라 다른 화면으로 가는 것들 — 시트의 처음 높이에 보인다 (2026-10-04).
            쓰는 빈도와 시급함 순이다: 백업(안 올린 기록 뱃지)이 먼저, 안내서·피드백은 그 다음. 라벨을 따로
            두지 않는다 — 「백업과 기록」 라벨 + 「백업과 기록 ›」 버튼으로 이름을 두 번 말하고 있었다 */}
        <div className="setting-links">
          <div className="setting">
            <button type="button" className="setting-link" onClick={onBackup}>
              <span>백업과 기록</span>
              {/* 안 올린 기록이 있으면 여기서부터 보인다 (2026-10-01) — 동기화 버튼은 한 겹 안이라
                  거기까지 들어가야 알면 늦다. 동기화를 안 쓰는 사람에게는 안 뜬다 */}
              {unsynced > 0 && <span className="sync-pending">안 올린 기록 {unsynced}건</span>}
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <span className="hint">Drive 백업과 기록 초기화예요.</span>
          </div>
          {review && (
            <div className="setting">
              <button type="button" className="setting-link" onClick={onReview}>
                <span>뜻 검수</span>
                <span className="chev" aria-hidden="true">›</span>
              </button>
              <span className="hint">
                한국어 뜻이 맞는지 보고 판정을 남겨요.{' '}
                <button
                  type="button"
                  className="link"
                  onClick={() => {
                    setReview(false)
                    saveReviewMode(false)
                  }}
                >
                  검수 모드 끄기
                </button>
              </span>
            </div>
          )}
          <div className="setting">
            <button type="button" className="setting-link" onClick={openGuide}>
              <span>사용 안내서</span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <span className="hint">이 앱이 다루는 것과 리포트 읽는 법이에요.</span>
          </div>
          <div className="setting">
            <button type="button" className="setting-link" onClick={onFeedback}>
              <span>피드백 보내기</span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <span className="hint">채점 기록은 안 가요. 보내기 전에 내용을 그대로 보여 드려요.</span>
          </div>
          <div className="setting">
            <button type="button" className="setting-link" onClick={onIntro}>
              <span>인트로 다시 보기</span>
              <span className="chev" aria-hidden="true">›</span>
            </button>
            <span className="hint">앱을 열 때 나오는 장면이에요.</span>
          </div>
        </div>

        <h3 className="setting-group">학습</h3>
        <p className="setting-group-note">무엇을 얼마나 낼지</p>
        <div className="setting">
          <label htmlFor="session-len">세션 길이</label>
          <div className="slider">
            <input
              id="session-len"
              type="range"
              min={LIMIT_MIN}
              max={LIMIT_MAX}
              step={STEP}
              value={settings.sessionLimit}
              style={{ '--f': (settings.sessionLimit - LIMIT_MIN) / (LIMIT_MAX - LIMIT_MIN) } as CSSProperties}
              onChange={(e) => update({ ...settings, sessionLimit: Number(e.target.value) })}
            />
            <span className="val">{settings.sessionLimit}장</span>
          </div>
          <span className="hint">한 세션에 낼 카드 수예요. 기본 {DEFAULT_SETTINGS.sessionLimit}</span>
        </div>
        <div className="setting">
          <label>모드 비율 (읽기 교정 : 어휘 확장)</label>
          <StepSlider
                label="모드 비율"
                options={RATIO_PRESETS}
                index={RATIO_PRESETS.findIndex((p) => sameRatio(settings.ratio, p.value))}
                onPick={(i) => update({ ...settings, ratio: RATIO_PRESETS[i]!.value })}
              />
          <span className="hint">한쪽 정원이 비면 다른 쪽이 채워요. 기본 7 : 3</span>
        </div>
        <div className="setting">
          <label htmlFor="kun-share">훈독 숙어 비율</label>
          {/* 켜고 끄기가 아니라 레인지다 (사용자 요청 2026-09-22) — 0 이면 안 내고,
              100 이면 훈독만 낸다. 실제 배분은 `selectSession` 의 정원이 맡는다 */}
          <div className="slider">
            <input
              id="kun-share"
              type="range"
              min={0}
              max={100}
              step={10}
              value={settings.kunPercent}
              style={{ '--f': settings.kunPercent / 100 } as CSSProperties}
              onChange={(e) => update({ ...settings, kunPercent: Number(e.target.value) })}
            />
            <span className="val">{settings.kunPercent}%</span>
          </div>
          <span className="hint">浜辺처럼 음독 없는 숙어를 섞는 몫이에요. 기본 0%</span>
        </div>

        {/* 관찰 문구를 빼고 나니 여기 남는 건 요미가나뿐인데, 그건 세션이 아니라
            **다시보기 화면** 설정이다 — 「세션 중」이 처음부터 틀린 이름이었다 */}
        <h3 className="setting-group">다시보기</h3>
        <p className="setting-group-note">틀렸던 것을 훑을 때</p>
        <div className="setting">
          <label>다시보기 요미가나</label>
          <StepSlider
                label="다시보기 요미가나"
                options={BROWSE_MASKS}
                index={BROWSE_MASKS.findIndex((o) => o.value === settings.browseMask)}
                onPick={(i) => update({ ...settings, browseMask: BROWSE_MASKS[i]!.value })}
              />
          <span className="hint">가리면 「읽기 보기」로 확인해요.</span>
        </div>

        <h3 className="setting-group">입력</h3>
        <div className="setting">
          <label>키보드</label>
          <StepSlider
                label="키보드"
                options={KEYBOARDS}
                index={KEYBOARDS.findIndex((o) => o.value === settings.keyboard)}
                onPick={(i) => update({ ...settings, keyboard: KEYBOARDS[i]!.value })}
              />
          <span className="hint">받아쓰기·음성 입력은 기기 키보드로 해요.</span>
        </div>
        <div className="setting">
          <label>자판 배열</label>
          <StepSlider
                label="자판 배열"
                options={KEYPAD_LAYOUTS.map((o) => ({ label: KEYPAD_LABEL[o] }))}
                index={KEYPAD_LAYOUTS.indexOf(settings.keypadLayout)}
                onPick={(i) => update({ ...settings, keypadLayout: KEYPAD_LAYOUTS[i]! })}
              />
          <span className="hint">l·q·v·x 를 빼면 남은 키가 넓어져요.</span>
        </div>
        <div className="setting">
          <label>자판 입력 피드백</label>
          <StepSlider
                label="자판 입력 피드백"
                options={KEY_FEEDBACKS.map((o) => ({ label: o.label, disabled: o.value === 'haptic' && !canVibrate() }))}
                index={KEY_FEEDBACKS.findIndex((o) => o.value === settings.keyFeedback)}
                onPick={(i) => update({ ...settings, keyFeedback: KEY_FEEDBACKS[i]!.value })}
              />
          <span className="hint">앱 자판에만 적용돼요.{canVibrate() ? ' 무음이면 소리는 안 나요.' : ' 이 기기는 진동을 못 써요.'}</span>
        </div>

        {/* 소리 (2026-10-03 사용자 지적 「tts가 너무 딱딱하다」). 음성이 하나도 없는 기기에서는 그룹째 안 보인다.
            어떤 소리가 덜 딱딱한지는 코드가 못 듣는다 — 기기에 있는 음성을 직접 고르고 들어 본다 */}
        {tts.available && voices.length > 0 && (
          <>
            <h3 className="setting-group">소리</h3>
            <p className="setting-group-note">읽기 소리 듣기</p>
            <div className="setting">
              <label htmlFor="tts-voice">음성</label>
              <div className="tts-voice-row">
                <select
                  id="tts-voice"
                  value={
                    // 이름으로 저장하던 때의 값도 받아 준다 — 같은 이름이 둘이면 첫째를 가리킨다
                    (voices.find((v) => v.id === ttsPrefs.voice) ??
                      voices.find((v) => v.name === ttsPrefs.voice))?.id ?? ''
                  }
                  onChange={(e) => setTtsPrefs({ ...ttsPrefs, voice: e.target.value })}
                >
                  <option value="">자동 (자연스러운 음성을 골라요)</option>
                  {voices.map((v) => (
                    <option key={v.id} value={v.id} lang={v.id.startsWith('file:') ? 'ja' : undefined}>
                      {v.label}
                      {v.online ? ' · 온라인' : ''}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn" onClick={() => tts.speak(TTS_SAMPLE)}>
                  들어보기
                </button>
              </div>
              {audioBase() !== '' && (
                <span className="hint">
                  없거나 못 받으면 기기 음성이 읽어요. 음성 합성:{' '}
                  {FILE_VOICES.map((v, i) => (
                    <span key={v.id}>
                      {i > 0 && ', '}
                      <span lang="ja">{v.credit}</span>
                    </span>
                  ))}
                </span>
              )}
              <span className="hint">기기에 설치된 음성이에요. 온라인 음성은 인터넷이 있어야 해요.</span>
            </div>
            {!fileVoice && (
              <>
                <div className="setting">
                  <label>발음 보정</label>
                  <StepSlider
                    label="발음 보정"
                    options={[{ label: '끔' }, { label: '켬' }]}
                    index={ttsPrefs.shape ? 1 : 0}
                    onPick={(i) => setTtsPrefs({ ...ttsPrefs, shape: i === 1 })}
                  />
                  <span className="hint">장음을 길게 읽게 하는 실험이에요. 기본은 꺼 둬요.</span>
                </div>
                <div className="setting">
                  <label>속도</label>
                  <StepSlider
                    label="소리 속도"
                    options={RATES.map((r) => ({ label: RATE_LABEL[r] }))}
                    index={RATES.indexOf(ttsPrefs.rate)}
                    onPick={(i) => setTtsPrefs({ ...ttsPrefs, rate: RATES[i]! })}
                  />
                  <span className="hint">바꾸고 「들어보기」로 들어 보세요.</span>
                </div>
              </>
            )}
          </>
        )}

        {/* 이 제목이 숨은 진입이다 — 길게 누르면 검수 모드가 열린다. 눈에 띄는 표시를
            두지 않는다: 보통 학습자에게는 그냥 묶음 제목이어야 한다 */}
        <h3
          className="setting-group"
          onPointerDown={startHold}
          onPointerUp={endHold}
          onPointerLeave={endHold}
          onPointerCancel={endHold}
        >
          보기
        </h3>
        <div className="setting">
          <label>테마</label>
          <StepSlider
                label="테마"
                options={THEMES}
                index={THEMES.findIndex((o) => o.value === theme)}
                onPick={(i) => setTheme(THEMES[i]!.value)}
              />
          <span className="hint">시스템은 기기 설정을 따라요.</span>
        </div>
        <div className="setting">
          <label>글자 크기</label>
          <StepSlider
                label="글자 크기"
                options={TEXT_SCALES}
                index={TEXT_SCALES.findIndex((o) => o.value === textScale)}
                onPick={(i) => setTextScale(TEXT_SCALES[i]!.value)}
              />
          <span className="hint">탭바·리포트·설정·찾기 글자예요. 학습 카드는 안 바뀌어요.</span>
        </div>

    </BottomSheet>
  )
}
