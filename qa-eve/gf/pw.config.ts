import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: /.*\.spec\.ts/, reporter: 'line', timeout: 120000,
  use: { baseURL: 'http://localhost:5180', ...devices['Desktop Chrome'], viewport:{width:1280,height:800},
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36' },
});
