import { defineConfig } from 'vitest/config'

// 테스트 전용 설정. 앱 빌드(vite.config.ts)와 분리 — Vite 8 / vitest 번들 vite 버전 충돌 회피
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tools/**/*.{test,spec}.ts'],
  },
})
