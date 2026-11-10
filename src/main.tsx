import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './app/App.tsx'
import { setStoragePrefix, storageKey, applyTheme, getThemeSettings } from './pane-ui-system'
import { activateAll } from './pane-ui-system/plugin'
import { PLUGINS } from './app/plugins'

// 🔴 React 가 뜨기 전에 한 번: 저장 접두사 → 플러그인 활성 → 저장 테마 적용.
//    ⭐ 약속 목록은 플러그인들의 contributes.interfaces 에서 모은다(옛 INTERFACES 데이터 주입 폐기 · 3판).
//    ⛔ 활성은 effect 안에서 안 한다(StrictMode 가 두 번 돈다) — 여기서 딱 한 번.
setStoragePrefix('shiftgrid.v2');

// 🔴 개발 서버(평소 HTTP · 5173 등)에 옛 서비스워커(dev-dist/sw.js)가 남아 있으면 브랜치·포트 전환 시
//    옛 번들을 가로채 빈 창을 띄운다 — HTTP 개발 환경에서는 등록된 서비스워커를 자동으로 걷어낸다.
if (import.meta.env.DEV && typeof window !== 'undefined' && window.location.protocol === 'http:' && 'serviceWorker' in navigator) {
  void navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) void r.unregister();
  }).catch(() => { /* 조용히 */ });
}

// 🔴 배포 직후 청크 해시 불일치(vite:preloadError)로 동적 import 가 실패할 때 세션당 한 번 자동 새로고침한다.
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', () => {
    try {
      const k = storageKey('preload-reloaded');
      if (sessionStorage.getItem(k) !== '1') {
        sessionStorage.setItem(k, '1');
        window.location.reload();
      }
    } catch { /* 조용히 */ }
  });
}

activateAll(PLUGINS);
applyTheme(getThemeSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
