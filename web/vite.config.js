import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' }, // 생성 워커가 코드 분할돼 iife 불가(T-hk9)
  server: { fs: { allow: ['..'] }, proxy: { '/api': 'http://127.0.0.1:3000' } },
});
