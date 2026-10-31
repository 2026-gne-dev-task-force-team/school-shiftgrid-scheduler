import { defineConfig } from 'vitest/config';

// vite.config.ts(웹 빌드 설정)를 import 하지 않고 독립 설정으로 둔다 — 테스트엔 PWA 플러그인 등이 필요 없다.
export default defineConfig({
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        environment: 'node',
        // 새 v2 는 아직 테스트가 없다 — 0건을 실패로 보지 않는다 (옛 테스트는 main·v1 브랜치에 있다)
        passWithNoTests: true,
    },
});
