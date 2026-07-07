import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages는 .../<repo>/ 하위 경로로 서빙되므로 상대 경로로 자산을 참조.
  // 레포 이름에 종속되지 않아 안전 (단일 페이지 앱 기준).
  base: './',
  plugins: [react()],
})
