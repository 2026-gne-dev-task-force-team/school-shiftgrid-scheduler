import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// 현황판 독립 입구 — 루트 앱 설정과 섞지 않는다. 판 번호는 빌드 상수로 박고 public/version.json 과 비교한다.
const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  base: './',
  cacheDir: fileURLToPath(new URL('../node_modules/.vite/board', import.meta.url)),
  define: { __BUILD__: JSON.stringify('preview-0') },
  build: { outDir: 'dist', emptyOutDir: true },
})
