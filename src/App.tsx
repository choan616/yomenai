// 앱 셸 — 화면 전환(상태 기반, 라우터 없음). 홈에서 학습·리포트·음독 맵·설정·진입 진단으로 분기
import { useState } from 'react'
import './study/study.css'
import './app/screens.css'
import { Diagnostic } from './app/Diagnostic.tsx'
import { Home } from './app/Home.tsx'
import { OnyomiMap } from './app/OnyomiMap.tsx'
import { Report } from './app/Report.tsx'
import { Settings } from './app/Settings.tsx'
import { Study } from './study/Study.tsx'

export type Screen =
  | 'home'
  | 'study'
  | 'rematch'
  | 'focus'
  | 'onyomi'
  | 'report'
  | 'diagnostic'
  | 'settings'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  // 집중 세션이 붙을 (한자, 음독) 쌍. 리포트의 처방이 정한다 (Phase 10)
  const [focusPair, setFocusPair] = useState<string | null>(null)
  const home = () => setScreen('home')

  switch (screen) {
    case 'study':
      return <Study onExit={home} />
    case 'rematch':
      return <Study kind="rematch" onExit={home} />
    case 'focus':
      // 쌍 없이 이 화면에 올 경로는 없지만, 상태가 어긋나면 홈으로 떨어뜨린다
      return focusPair === null ? (
        <Home onNavigate={setScreen} />
      ) : (
        <Study kind="focus" focusPairId={focusPair} onExit={home} />
      )
    case 'onyomi':
      return <OnyomiMap onBack={home} />
    case 'report':
      return (
        <Report
          onBack={home}
          onFocus={(pairId) => {
            setFocusPair(pairId)
            setScreen('focus')
          }}
        />
      )
    case 'diagnostic':
      return <Diagnostic onDone={() => setScreen('report')} onExit={home} />
    case 'settings':
      return <Settings onBack={home} />
    default:
      return <Home onNavigate={setScreen} />
  }
}
