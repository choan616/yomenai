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
        description: '일본어 한자 읽기를 진단하고 교정하는 앱',
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
          // 조회 전용(914KB) — 昨日·今日 처럼 읽기를 한자 단위로 못 가르는 말이다.
          // 소설을 읽으면 반드시 만나므로 첫 실행부터 오프라인으로 찾아져야 한다
          'dict/lookup.json',
          'dict/pairs.json',
          'dict/kanji.json',
          'dict/examples.json',
        ],
        // ocr/ — 카메라 한자 인식 모델·엔진 (7.4MB). **프리캐시에 넣지 않는다** —
        // 카메라를 안 쓰는 사람에게 받게 할 이유가 없다. band4.json 과 같은 자리다.
        // `**/*.{js,...}` 가 .wasm.js 와 worker 를 먼저 집으므로 여기서 빼야 한다
        // fonts/*-wide.woff2 + fonts/wide.css — 넓힌 사전 전용 글자(1.4MB)와 그 @font-face
        // 선언(39KB). 사전이 지연 로드면 폰트도 지연 로드라야 한다.
        // `**/*.{...,woff2}` 와 `**/*.{...,css}` 가 먼저 집으므로 여기서 빼야 한다
        globIgnores: [
          '**/dict/band4.json',
          '**/dict/wide.json',
          '**/ocr/**',
          '**/fonts/*-wide.woff2',
          '**/fonts/wide.css',
        ],
        /**
         * 프리캐시에 넣을 파일 하나의 상한. **넘으면 빌드가 실패한다** —
         * vite-plugin-pwa 가 PLUGIN_ERROR 를 던진다 (실측 2026-09-22). 조용히 빠지진 않으니
         * 위험한 값은 아니지만, 닿는 순간 배포가 막힌다.
         *
         * base.json 은 필드를 더할 때마다 큰다 — readingKind 를 넣으며 5.42 → 5.63MB 가
         * 됐고 옛 상한 6MB 까지 0.37MB 밖에 안 남았었다. 12MB 로 여유를 둔다.
         * 밴드 4(20MB)는 이 값과 무관하게 globIgnores 가 이미 뺀다.
         *
         * 매 빌드의 여유는 `tools/check-precache.mjs` 가 찍는다 (그 파일의 CAP 과 같이 고친다)
         */
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        // guide.html 은 앱이 아니라 독립 문서다. 이게 없으면 SW 가 설치된 기기에서
        // 안내서 주소로 들어가도 앱 셸(index.html)이 대신 뜬다.
        navigateFallbackDenylist: [/^\/yomenai\/dict\//, /^\/yomenai\/guide\.html$/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            // 카메라 인식 자산 — 첫 사용 때 받고 그 뒤로는 캐시에서 온다.
            // 내용이 바뀌지 않는 고정 자산이라 CacheFirst 다 (band4 는 갱신될 수 있어
            // StaleWhileRevalidate 인 것과 다르다)
            urlPattern: ({ url }) => url.pathname.startsWith('/yomenai/ocr/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'yomenai-ocr-v1',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
          {
            // wide.json — 학습 사전 밖 조회용(2.2MB). 「사전 밖에서 찾을까」에 그렇다고
            // 답한 적이 있어야 받는다. band4 와 같은 자리다
            urlPattern: ({ url }) => url.pathname === '/yomenai/dict/wide.json',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'yomenai-dict-wide-v1',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 넓힌 사전 전용 폰트·선언. 사전과 같이 처음 받고 그 뒤로는 캐시에서 온다.
            // 내용이 바뀌지 않는 고정 자산이라 CacheFirst 다 (ocr 과 같다)
            urlPattern: ({ url }) => /\/fonts\/(wide\.css|.*-wide\.woff2)$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'yomenai-fonts-wide-v1',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false }, // dev 서버·e2e(=npm run dev)에는 SW 안 붙인다
    }),
  ],
}))
