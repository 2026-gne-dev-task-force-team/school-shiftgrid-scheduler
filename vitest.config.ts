import { defineConfig } from 'vitest/config';

// 엔진 판 전용 vitest 설정. vite.config.ts(껍데기 판이 electron 플러그인을 넣는다)를 import 하지 않는다.
export default defineConfig({
    test: {
        // 엔진 + 순수 스토어 연산(doc-ops) + 엑셀 입출력(io). 화면(React)은 안 돈다 — DOM 이 없다
        include: ['src/engine/**/*.test.ts', 'src/store/**/*.test.ts', 'src/types/**/*.test.ts', 'src/io/**/*.test.ts', 'src/pwa/**/*.test.ts', 'src/ui/**/*.test.tsx'],
        environment: 'node',
        // 윈도우·느린 기기에서 엔진 small 시험이 혼자 7.8초 — 기본 5초를 넘는다. 1.2v T-10ck 와 같은 값으로 전역 늘림
        testTimeout: 20000,
    },
});
