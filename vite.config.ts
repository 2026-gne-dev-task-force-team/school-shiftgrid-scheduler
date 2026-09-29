import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
// 앱 버전(package.json)을 화면·의견 창구가 읽을 수 있게 넣는다
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')).version as string
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// 웹(GitHub Pages) 빌드 설정. Electron 은 vite.electron.config.ts 가 따로 맡는다.
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  // GitHub Pages는 .../<repo>/ 하위 경로로 서빙되므로 상대 경로로 자산을 참조.
  // 레포 이름에 종속되지 않아 안전 (단일 페이지 앱 기준).
  base: './',
  plugins: [
    react(),
    // PWA — 폰 홈 화면에 붙이고 오프라인에서도 뜨게. 규칙 엔진·솔버가 전부 브라우저 안에서 돌아
    // 서버가 필요 없으니 한 번 받으면 그대로 산다. 새 배포가 올라오면 다음 실행에 조용히 갈아탄다.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons.svg', 'icons/*.png'],
      manifest: {
        name: '시간표 짜기',
        short_name: '시간표',
        description: '규칙을 데이터로 받는 초등 시간표 도구',
        lang: 'ko',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f6f9',
        theme_color: '#f4f6f9',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // xlsx 청크가 500 KB 를 넘는다 — 기본 상한(2 MB)은 넉넉하지만 명시해 둔다
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
})
