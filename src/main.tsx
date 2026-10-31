import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme } from './theme/apply'
import { loadThemeSettings } from './theme/settings'

// 🔴 React 가 뜨기 전에 저장된 테마를 한 번 꽂는다 — 안 하면 기본 그림 → 저장 테마로 깜빡인다
applyTheme(loadThemeSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
