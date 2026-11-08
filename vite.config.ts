import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'
// 앱 버전(package.json)을 화면·의견 창구가 읽을 수 있게 넣는다
const APP_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')).version as string
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

// 🔴 PWA 설치는 HTTPS 에서만 된다 — 폰에서 홈 화면에 붙여 보려면 dev 서버도 HTTPS 여야 한다.
//    ⛔ 평소 실행(npm run dev · 5173)은 안 바꾼다 — 쥔님 기본은 HTTP 다. VITE_HTTPS=1 일 때만 켠다.
//    쓰는 법: npm run dev:https → https://<호스트>:5201/ 에서 자가서명 인증서 경고를 넘기면 설치 가능.
const https = process.env.VITE_HTTPS === '1'

// 웹(GitHub Pages) 빌드 설정. 일렉트론 판은 2026-10-31 걷어냈다 — 이제 이 설정 하나뿐이다.
export default defineConfig({
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  // 🔴 워크트리마다 의존성 캐시를 따로 둔다. 워크트리들이 node_modules 를 심링크로 같이 쓰면
  //    기본 캐시(node_modules/.vite)도 하나라서, 한 서버가 재최적화할 때 다른 서버의 deps 를
  //    지워 「504 Outdated Optimize Dep」이 난다 (2026-11-08 실측). 폴더 이름으로 칸을 가른다.
  cacheDir: `node_modules/.vite/${basename(fileURLToPath(new URL('.', import.meta.url)))}`,
  // GitHub Pages는 .../<repo>/ 하위 경로로 서빙되므로 상대 경로로 자산을 참조.
  // 레포 이름에 종속되지 않아 안전 (단일 페이지 앱 기준).
  base: './',
  // VITE_HTTPS=1 일 때만 HTTPS — basicSsl 플러그인이 자가서명 인증서를 server.https 에 채운다
  server: https ? { https: {} } : undefined,
  plugins: [
    react(),
    // HTTPS 를 켤 때만 자가서명 인증서 플러그인을 끼운다
    ...(https ? [basicSsl()] : []),
    // PWA — 폰 홈 화면에 붙이고 오프라인에서도 뜨게. 규칙 엔진·솔버가 전부 브라우저 안에서 돌아
    // 서버가 필요 없으니 한 번 받으면 그대로 산다. 새 배포가 올라오면 다음 실행에 조용히 갈아탄다.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // 🔴 dev 서비스워커는 VITE_HTTPS=1(폰 홈 화면 설치 확인용 · 5201)일 때만 켠다 — 평소 HTTP(5173)에서 켜 두면
      //    브랜치·워크트리 전환 때 dev-dist/sw.js 가 옛 응답을 캐시해 강력 새로고침으로도 안 풀리는 빈 창을 만든다.
      devOptions: { enabled: https },
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
        // 🔴 현재 테마(라이트)에 맞춘다 — 다크는 index.html 의 media theme-color 가 맡는다(판 A)
        background_color: '#ffffff',
        theme_color: '#ffffff',
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
