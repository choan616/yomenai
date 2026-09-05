import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
// GitHub Pages 는 choan616/yomenai 프로젝트 페이지라 choan616.github.io/yomenai/ 서브패스로
// 뜬다. `npm run dev` 는 base 영향 없이 '/' 그대로 두고, build·preview 에서만 서브패스를 쓴다
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/yomenai/' : '/',
  plugins: [react()],
}))
