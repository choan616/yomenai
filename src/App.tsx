// 앱 셸 — 화면 전환(상태 기반, 라우터 없음). 홈에서 학습·리포트·음독 맵·설정·진입 진단으로 분기
import { useState } from 'react'
import './study/study.css'
import './app/screens.css'
import { Home } from './app/Home.tsx'
import { OnyomiMap } from './app/OnyomiMap.tsx'
import { Report } from './app/Report.tsx'
import { Study } from './study/Study.tsx'

export type Screen = 'home' | 'study' | 'onyomi' | 'report'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const home = () => setScreen('home')

  switch (screen) {
    case 'study':
      return <Study onExit={home} />
    case 'onyomi':
      return <OnyomiMap onBack={home} />
    case 'report':
      return <Report onBack={home} />
    default:
      return <Home onNavigate={setScreen} />
  }
}
