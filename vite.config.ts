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
      // 학습 중에 페이지가 갈리면 풀던 답이 사라진다. 새 SW 는 사용자가 「지금 적용」을
      // 누를 때까지 대기시킨다 (src/app/UpdateBanner.tsx)
      registerType: 'prompt',
      injectRegister: null, // 등록은 UpdateBanner 가 한다. script 주입과 겹치면 이중 등록이다
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
        // skipWaiting 을 안 켠다 — 새 SW 가 기다려야 띠를 띄울 수 있다
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
        // guide.html 은 앱이 아니라 독립 문서다. 이게 없으면 SW 가 설치된 기기에서
        // 안내서 주소로 들어가도 앱 셸(index.html)이 대신 뜬다
        navigateFallbackDenylist: [/^\/yomenai\/dict\//, /^\/yomenai\/guide\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
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
