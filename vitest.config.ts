import { defineConfig } from 'vitest/config';

// 엔진 판 전용 vitest 설정. vite.config.ts(껍데기 판이 electron 플러그인을 넣는다)를 import 하지 않는다.
export default defineConfig({
    test: {
        include: ['src/engine/**/*.test.ts'],
        environment: 'node',
    },
});
