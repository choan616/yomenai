import { defineConfig } from '@playwright/test'

// 크롬 채널로 전부 돌리고, 그려진 결과를 재는 스펙만 WebKit 으로 한 번 더 돌린다 (projects 주석)
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  // 두 스펙이 같은 오리진의 IndexedDB 를 공유한다 (full-flow 가 deleteDatabase 로 초기화).
  // 동시 실행 시 서로의 상태를 건드리므로 단일 워커로 직렬화한다.
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
  },
  projects: [
    { name: 'chrome', use: { channel: 'chrome' } },
    {
      /**
       * WebKit — **iOS 에서만 깨지는 CSS 를 잡으려고 둔다** (2026-09-21).
       *
       * 요미가나 가림막이 크롬 e2e 를 다 통과하고 실기기에서 카드 높이만 한 기둥이 됐다.
       * `rt` 의 `position` 을 WebKit 이 무시하는 것이었는데, 브라우저가 크롬 하나뿐이라
       * 검사가 볼 방법이 없었다 (context-notes 2026-09-21).
       *
       * **전부는 안 돌린다.** 시간이 두 배가 되고, CDP 를 쓰는 스펙(`screen-cache`)은
       * 크로미움 전용이라 WebKit 에서 돌지도 않는다. 여기 드는 것은 **그려진 결과를 재는**
       * 스펙뿐이다 — 흐름·로직은 크롬 한 번으로 족하다.
       *
       * 데스크톱 WebKit 이 iOS Safari 와 같지는 않다. 같은 엔진 계열이라 이런 종류를
       * 잡을 뿐, 통과가 실기기 확인을 대신하지 않는다.
       */
      name: 'webkit',
      use: { browserName: 'webkit' },
      testMatch: ['**/browse-mask.spec.ts', '**/browse-reroll.spec.ts', '**/ja-lang.spec.ts'],
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
