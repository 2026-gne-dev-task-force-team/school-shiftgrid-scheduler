import { defineConfig } from 'vitest/config';

// vite.config.ts(웹 빌드 설정)를 import 하지 않고 독립 설정으로 둔다 — 테스트엔 PWA 플러그인 등이 필요 없다.
// v1·v2 옛 코드(_참고/)는 참고용 박제라 테스트 대상에서 뺀다.
export default defineConfig({
    test: {
        include: ['src/**/*.test.{ts,tsx}'],
        exclude: ['_참고/**', 'node_modules/**'],
        environment: 'node',
        // 새 v2 는 아직 테스트가 없다 — 0건을 실패로 보지 않는다 (옛 테스트는 _참고/ 로 갔다)
        passWithNoTests: true,
    },
});
