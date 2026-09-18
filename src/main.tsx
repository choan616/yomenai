import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { applyTheme, loadTheme } from './app/theme.ts'
import { applyTextScale, loadTextScale } from './app/textScale.ts'

// 첫 페인트 전에 테마·글자 크기를 적용해 깜빡임을 막는다
applyTheme(loadTheme())
applyTextScale(loadTextScale())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
