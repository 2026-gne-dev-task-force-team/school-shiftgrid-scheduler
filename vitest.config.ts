import { defineConfig } from 'vitest/config';

// 엔진 판 전용 vitest 설정. vite.config.ts(껍데기 판이 electron 플러그인을 넣는다)를 import 하지 않는다.
export default defineConfig({
    test: {
        // 엔진 + 순수 스토어 연산(doc-ops). 화면(React)은 안 돈다 — DOM 이 없다
        include: ['src/engine/**/*.test.ts', 'src/store/**/*.test.ts', 'src/types/**/*.test.ts'],
        environment: 'node',
    },
});
