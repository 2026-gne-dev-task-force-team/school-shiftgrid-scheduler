import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { setStoragePrefix, applyTheme, loadThemeSettings } from './pane-ui-system'
import { activateAll } from './pane-ui-system/plugin'
import { PLUGINS } from './app/plugins'
import { appHost } from './app/host'
import { initDoc, registerAppCommands } from './app/document'

// 🔴 React 가 뜨기 전에 한 번: 저장 접두사 → 문서 다리·임시 보관(initDoc) → 플러그인 활성(뷰 등록) →
//    앱 문서 명령·리본(새 문서·열기·저장) → 저장 테마 적용.
//    ⛔ 활성은 effect 안에서 안 한다(StrictMode 가 두 번 돈다) — 여기서 딱 한 번.
//    🔴 initDoc 이 activateAll 보다 먼저다 — 플러그인 activate 안에서도 host.doc 다리가 돌아야 한다.
setStoragePrefix('shiftgrid.v2');
initDoc();
activateAll(PLUGINS);
registerAppCommands(appHost);
applyTheme(loadThemeSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
