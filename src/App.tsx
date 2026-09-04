// 앱 셸 — 화면 전환(상태 기반, 라우터 없음). 홈 ↔ 학습 세션
import { useState } from 'react'
import './study/study.css'
import { Home } from './app/Home.tsx'
import { Study } from './study/Study.tsx'

type Screen = 'home' | 'study'

export default function App() {
  const [screen, setScreen] = useState<Screen>('home')

  return screen === 'home' ? (
    <Home onStart={() => setScreen('study')} />
  ) : (
    <Study onExit={() => setScreen('home')} />
  )
}
