import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyTheme, getTheme } from './ui/help/theme'

// 첫 그리기 전에 테마를 적용해 밝은↔어두운 전환 순간의 깜빡임을 막는다
applyTheme(getTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
