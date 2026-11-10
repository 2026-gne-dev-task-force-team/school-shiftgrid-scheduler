import { defineConfig, devices } from '@playwright/test';

// 브라우저 e2e — 탐색기 등 화면 동작을 실제 크롬으로 확인한다. ⛔ deploy.yml CI 에는 걸지 않는다(배포 속도).
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    reporter: 'line',
    use: { baseURL: 'http://localhost:5299', trace: 'retain-on-failure' },
    // 🔴 UA 를 맥으로 못 박는다 — 앱의 Mod 키는 userAgentData.platform 을 따르고(⌘), 맥 호스트의 크롬은 Ctrl+클릭을 우클릭으로 바꿔 버려
    //    윈도우 UA 면 「Ctrl+클릭 여러 개 고르기」를 잴 수 없다. 호스트가 뭐든 같은 결과가 나오게 한다.
    projects: [{
        name: 'chromium',
        use: {
            ...devices['Desktop Chrome'],
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36',
        },
    }],
    webServer: {
        command: 'npx vite --port 5299 --strictPort',
        url: 'http://localhost:5299',
        reuseExistingServer: false,
        timeout: 60_000,
    },
});
