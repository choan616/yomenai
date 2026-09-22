// 업데이트 배너가 실제로 도는지 **프로덕션 빌드**로 확인한다 (2026-09-22).
//
// `npm run e2e` 로는 못 잡는 자리다 — `vite.config.ts` 의 `devOptions: { enabled: false }` 라
// dev 서버에는 서비스워커가 안 붙는다. 그래서 여기서만 build → preview → 갱신 → 적용을
// 실제로 돌린다.
//
// 재는 것: 배너가 뜨는가, 「지금 적용」이 화면을 새 버전으로 바꾸는가.
// **두 경우를 다 본다** — 처음 깐 탭 그대로, 그리고 한 번 새로고침한 뒤.
// workbox 가 `isUpdate` 를 등록 시점의 컨트롤러 유무로 정하기 때문에 둘이 갈렸었다
// (`src/app/UpdateBanner.tsx` 주석).
//
// 쓰는 법: `npm run check:update`
//   Home.tsx 의 태그라인을 잠깐 바꿔 v2 를 만들고, 끝나면 되돌려 다시 빌드한다.
import { chromium } from '@playwright/test'
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'

const HOME = 'src/app/Home.tsx'
const MARK = '일본어 한자, 당황하지 말자!'
const PORT = 4173
const URL = `http://localhost:${PORT}/yomenai/`

const orig = readFileSync(HOME, 'utf8')
if (!orig.includes(MARK)) {
  console.error(`${HOME} 에서 태그라인("${MARK}")을 못 찾았다 — 이 도구가 그걸 v2 표식으로 쓴다.`)
  process.exit(1)
}

const build = () => execSync('npx vite build', { stdio: 'pipe' })
const restore = () => {
  writeFileSync(HOME, orig, 'utf8')
  build()
}

async function waitFor(fn, ms = 30000) {
  const until = Date.now() + ms
  for (;;) {
    if (await fn()) return true
    if (Date.now() > until) return false
    await new Promise((r) => setTimeout(r, 200))
  }
}

console.log('v1 빌드…')
build()

// 인자를 배열로 주면서 shell 을 켜면 node 가 이스케이프 경고를 낸다. 한 줄로 넘긴다
const preview = spawn(`npx vite preview --port ${PORT}`, { stdio: 'ignore', shell: true })
const up = await waitFor(() => fetch(URL).then((r) => r.ok, () => false), 30000)
if (!up) {
  preview.kill()
  restore()
  console.error(`preview 서버가 ${URL} 에 안 떴다.`)
  process.exit(1)
}

const browser = await chromium.launch({ channel: 'chrome' })
const rows = []

/** reloadFirst=true 면 첫 설치 뒤 한 번 새로고침해 **컨트롤러를 가진 채** 시작한다 */
async function scenario(label, reloadFirst) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(URL)
  const controlled = () => page.evaluate(() => !!navigator.serviceWorker.controller)
  if (!(await waitFor(controlled))) throw new Error(`${label}: 서비스워커가 페이지를 제어하지 않는다`)
  if (reloadFirst) {
    await page.reload()
    if (!(await waitFor(controlled))) throw new Error(`${label}: 새로고침 뒤 제어가 끊겼다`)
  }

  const v2 = `업데이트 확인 ${label}`
  writeFileSync(HOME, orig.replace(MARK, v2), 'utf8')
  build()

  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update())
  const shown = await page
    .locator('.update-banner')
    .waitFor({ state: 'visible', timeout: 20000 })
    .then(() => true, () => false)

  let applied = false
  if (shown) {
    await page.getByRole('button', { name: '지금 적용' }).click()
    applied = await page
      .waitForFunction((t) => document.querySelector('.tagline')?.textContent === t, v2, { timeout: 20000 })
      .then(() => true, () => false)
  }

  rows.push({ label, shown, applied })
  writeFileSync(HOME, orig, 'utf8')
  build()
  await ctx.close()
}

let failed = false
try {
  await scenario('첫 설치한 탭 그대로', false)
  await scenario('한 번 새로고침한 뒤', true)
} catch (e) {
  failed = true
  console.error(e instanceof Error ? e.message : String(e))
} finally {
  await browser.close()
  preview.kill()
  restore()
}

console.log('')
for (const r of rows) {
  console.log(`  ${r.label.padEnd(18)} 배너 ${r.shown ? 'O' : 'X'} · 적용 후 새 버전 ${r.applied ? 'O' : 'X'}`)
}
const ok = rows.length === 2 && rows.every((r) => r.shown && r.applied)
console.log(ok ? '\n통과' : '\n실패')
process.exit(ok && !failed ? 0 : 1)
