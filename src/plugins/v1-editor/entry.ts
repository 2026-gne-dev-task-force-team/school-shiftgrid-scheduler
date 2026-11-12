// v1 편성기 iframe 입구 — 설계 ① 2-1 · P10a. v1-editor.html 이 이 파일을 싣는다.
// legacy 는 손대지 않는 사본이라 main.tsx 대신 여기서 같은 순서로 띄운다(테마 → 렌더).
// legacy 를 동적 import 하기 전에 window.platform 을 꾸러미 구현으로 꽂는다(P10b).
import { createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './legacy/index.css'
import { installBundlePlatform } from './bundle-platform'

export async function mountV1Editor(root: HTMLElement): Promise<void> {
  installBundlePlatform()
  const [{ default: App }, { applyTheme, getTheme }] = await Promise.all([
    import('./legacy/App.tsx'),
    import('./legacy/ui/help/theme'),
  ])
  // 첫 그리기 전에 테마를 적용해 깜빡임을 막는다(v1 main.tsx 와 같은 순서)
  applyTheme(getTheme())
  createRoot(root).render(createElement(StrictMode, null, createElement(App)))
}

const el = typeof document === 'undefined' ? null : document.getElementById('root')
if (el) void mountV1Editor(el)
