import { defineConfig } from '@playwright/test'

// 설치된 Chrome 채널을 쓴다 — 별도 브라우저 다운로드 없이 실브라우저에서 카드 전환을 실측한다
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
