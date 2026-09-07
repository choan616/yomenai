import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// GitHub Pages 는 choan616/yomenai 프로젝트 페이지라 choan616.github.io/yomenai/ 서브패스로
// 뜬다. `npm run dev` 는 base 영향 없이 '/' 그대로 두고, build·preview 에서만 서브패스를 쓴다.
//
// 서비스 워커: mmtm(choan616.github.io 루트)의 SW 가 스코프 '/' 로 오리진 전체를 가로채
// /yomenai/ 진입 시 mmtm 셸이 뜨는 일이 있었다. yomenai 가 '/yomenai/' 스코프 SW 를
// 직접 등록하면 그 경로에선 더 좁은 등록이 이긴다. 겸사겸사 오프라인(로컬 우선 PWA, PLAN §2).
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/yomenai/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', // 새 SW 는 프롬프트 없이 즉시 반영 (mmtm SW 를 빨리 밀어낸다)
      injectRegister: 'script', // index.html 에 registerSW.js 를 넣는다 (앱 코드 수정 없음)
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'icons.svg'],
      manifest: {
        name: 'yomenai — 読めない',
        short_name: 'yomenai',
        description: '뜻은 아는데 못 읽는 일본어 숙어를 바로잡는 앱',
        lang: 'ko',
        start_url: '/yomenai/',
        scope: '/yomenai/',
        display: 'standalone',
        background_color: '#141210',
        theme_color: '#141210',
        icons: [
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        ],
      },
      workbox: {
        // 프리캐시: 앱 셸 + 폰트 + 핵심 사전(밴드 0~3·쌍·한자·예문). 첫 실행부터 오프라인이 되게.
        // band4.json(19MB, 밴드 4 = "선택")만 런타임 캐시로 미룬다.
        globPatterns: [
          '**/*.{js,css,html,woff2}',
          'dict/base.json',
          'dict/pairs.json',
          'dict/kanji.json',
          'dict/examples.json',
        ],
        globIgnores: ['**/dict/band4.json'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, // base.json 이 ~5.5MB
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/yomenai\/dict\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // band4.json — 밴드 4 를 켠 적이 있으면 그때 캐시되고 이후 오프라인에서 열린다.
            urlPattern: ({ url }) => url.pathname === '/yomenai/dict/band4.json',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'yomenai-dict-band4-v1',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false }, // dev 서버·e2e(=npm run dev)에는 SW 안 붙인다
    }),
  ],
}))
