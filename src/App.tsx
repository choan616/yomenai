// 앱 셸 — 화면 전환(상태 기반, 라우터 없음). 홈에서 학습·리포트·음독 맵·설정·진입 진단으로 분기
import { useState } from 'react'
import './study/study.css'
import './app/screens.css'
import { Diagnostic } from './app/Diagnostic.tsx'
import { Home } from './app/Home.tsx'
import { OnyomiMap } from './app/OnyomiMap.tsx'
import { Report } from './app/Report.tsx'
import { Settings } from './app/Settings.tsx'
import { Browse } from './app/Browse.tsx'
import { Search } from './app/Search.tsx'
import { Feedback } from './app/Feedback.tsx'
import { Rules } from './app/Rules.tsx'
import type { RuleId } from './app/rules.ts'
import { Study } from './study/Study.tsx'
import { UpdateBanner } from './app/UpdateBanner.tsx'
import { QUICK_SESSION_LIMIT } from './app/settings.ts'

export type Screen =
  | 'home'
  | 'study'
  | 'quick'
  | 'rematch'
  | 'focus'
  | 'onyomi'
  | 'report'
  | 'browse'
  | 'search'
  | 'feedback'
  | 'rules'
  | 'diagnostic'
  | 'settings'

export default function App() {
  return (
    <>
      <Screens />
      <UpdateBanner />
    </>
  )
}

function Screens() {
  const [screen, setScreen] = useState<Screen>('home')
  /**
   * 다시보기를 어디서 열었나 (2026-09-14). 리포트에도 홈에도 진입점이 있어서,
   * 나갈 때 들어온 자리로 돌려보내야 한다. 고정해 두면 홈에서 들어간 사람이
   * 나가면서 난데없이 리포트에 떨어진다.
   */
  const [browseFrom, setBrowseFrom] = useState<Screen>('report')

  /**
   * 규칙 화면을 어디서 열었나 (2026-09-17). 홈과 리포트 처방 두 군데서 들어온다 —
   * `browseFrom` 과 같은 이유로 돌아갈 자리를 적어 둔다.
   * 세션 중에는 여기로 안 온다 (나가면 세션 큐가 초기화된다). 카드 옆에서는 오답 상세가
   * 같은 절을 인라인으로 펼친다
   */
  const [rulesFrom, setRulesFrom] = useState<Screen>('home')
  /** 열린 채로 뜰 절. 처방에서 들어올 때만 채운다 */
  const [focusRule, setFocusRule] = useState<RuleId | null>(null)

  /** 홈에서 나가는 모든 이동. 다시보기·규칙으로 갈 때만 돌아올 자리를 적어 둔다 */
  const fromHome = (next: Screen) => {
    if (next === 'browse') setBrowseFrom('home')
    if (next === 'rules') {
      setRulesFrom('home')
      setFocusRule(null)
    }
    setScreen(next)
  }
  // 집중 세션이 붙을 (한자, 음독) 쌍. 리포트의 처방이 정한다 (Phase 10)
  const [focusPair, setFocusPair] = useState<string | null>(null)
  const home = () => setScreen('home')

  switch (screen) {
    case 'study':
      return <Study onExit={home} />
    case 'quick':
      // 의욕 없는 날의 진입로. 설정을 안 건드리므로 다음 세션은 원래 길이로 돌아온다 (Phase 11)
      return <Study limit={QUICK_SESSION_LIMIT} onExit={home} />
    case 'rematch':
      return <Study kind="rematch" onExit={home} />
    case 'focus':
      // 쌍 없이 이 화면에 올 경로는 없지만, 상태가 어긋나면 홈으로 떨어뜨린다
      return focusPair === null ? (
        <Home onNavigate={fromHome} />
      ) : (
        <Study kind="focus" focusPairId={focusPair} onExit={home} />
      )
    case 'onyomi':
      return <OnyomiMap onBack={home} />
    case 'report':
      return (
        <Report
          onBack={home}
          onBrowse={() => {
            setBrowseFrom('report')
            setScreen('browse')
          }}
          onFocus={(pairId) => {
            setFocusPair(pairId)
            setScreen('focus')
          }}
          onRule={(id) => {
            setRulesFrom('report')
            setFocusRule(id)
            setScreen('rules')
          }}
        />
      )
    case 'search':
      return <Search onBack={home} />
    case 'browse':
      return <Browse onExit={() => setScreen(browseFrom)} />
    case 'rules':
      return <Rules onBack={() => setScreen(rulesFrom)} focus={focusRule} />
    case 'feedback':
      return <Feedback onBack={() => setScreen('settings')} />
    case 'diagnostic':
      return <Diagnostic onDone={() => setScreen('report')} onExit={home} />
    case 'settings':
      return <Settings onBack={home} onFeedback={() => setScreen('feedback')} />
    default:
      return <Home onNavigate={fromHome} />
  }
}
