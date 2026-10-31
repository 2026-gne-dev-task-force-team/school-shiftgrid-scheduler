import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { setStoragePrefix, applyTheme, loadThemeSettings } from './pane-ui-system'
import { activateAll } from './pane-ui-system/plugin'
import { PLUGINS } from './app/plugins'

// 🔴 React 가 뜨기 전에 한 번: 저장 접두사 → 플러그인 활성(뷰 등록) → 저장 테마 적용.
//    ⛔ 활성은 effect 안에서 안 한다(StrictMode 가 두 번 돈다) — 여기서 딱 한 번.
setStoragePrefix('shiftgrid.v2');
activateAll(PLUGINS);
applyTheme(loadThemeSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
