// 음성 파일(VOICEVOX) — 설정에서 고르고, 들어보기가 파일로 재생되며, 파일이 없으면 기기 음성으로 돌아간다 (2026-10-03)
//
// 진짜 소리는 검증하지 않는다. `AudioBufferSourceNode.start` 호출 수와 `speechSynthesis.speak` 호출을 센다.
// 개발 서버는 음성 파일 주소가 꺼져 있어서(기본), `localStorage['yomenai:audioBase']` 로 켜고 요청을 가로챈다.
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

const TONE = readFileSync('tests/e2e/fixtures/tone.mp3')

async function prepare(page: Page, opts: { files: 'ok' | 'missing' }): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __started: number; __spoken: string[] }
    w.__started = 0
    w.__spoken = []
    const start = AudioBufferSourceNode.prototype.start
    AudioBufferSourceNode.prototype.start = function (...a: Parameters<typeof start>) {
      w.__started++
      return start.apply(this, a)
    }
    const fake = {
      getVoices: () => [{ name: 'Kyoko', voiceURI: 'kyoko', lang: 'ja-JP', localService: true, default: false }],
      speak: (u: { text: string }) => w.__spoken.push(u.text),
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true })
    class FakeUtterance {
      text: string
      lang = ''
      rate = 1
      volume = 1
      voice: unknown = null
      constructor(text: string) {
        this.text = text
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true })
    try {
      localStorage.setItem('yomenai:audioBase', '/yomenai-audio')
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.route('**/yomenai-audio/**', (route) =>
    opts.files === 'ok'
      ? route.fulfill({ status: 200, contentType: 'audio/mpeg', body: TONE })
      : route.fulfill({ status: 404, body: '' }),
  )
}

const state = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __started: number; __spoken: string[] }
    return { started: w.__started, spoken: w.__spoken }
  })

async function openSettings(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '설정', exact: true }).click()
}

test('음성 파일 둘이 목록 맨 앞에 있고, 기본은 玄野武宏 파일로 재생된다', async ({ page }) => {
  await prepare(page, { files: 'ok' })
  const urls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/yomenai-audio/')) urls.push(new URL(r.url()).pathname)
  })
  await openSettings(page)

  await expect(page.getByLabel('음성').locator('option')).toHaveText([
    '자동 (자연스러운 음성을 골라요)',
    '음성 파일 · 玄野武宏',
    '음성 파일 · 四国めたん',
    'Kyoko',
  ])
  // 규약이 요구하는 크레딧 표기
  await expect(page.getByText('VOICEVOX:玄野武宏(CV:ガロ)')).toBeVisible()
  await expect(page.getByText('VOICEVOX:四国めたん')).toBeVisible()

  await page.getByRole('button', { name: '들어보기' }).click()
  await expect.poll(async () => (await state(page)).started).toBe(1)
  expect((await state(page)).spoken).toEqual([]) // 기기 음성은 쓰지 않았다
  expect(urls).toHaveLength(1)
  expect(urls[0]).toMatch(/^\/yomenai-audio\/kurono\/[0-9a-f]{16}\.mp3$/)
})

test('四国めたん 을 고르면 그 폴더에서 받고, 발음 보정·속도는 숨는다', async ({ page }) => {
  await prepare(page, { files: 'ok' })
  const urls: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/yomenai-audio/')) urls.push(new URL(r.url()).pathname)
  })
  await openSettings(page)
  await expect(page.getByRole('group', { name: '소리 속도' })).toHaveCount(0)
  await expect(page.getByRole('group', { name: '발음 보정' })).toHaveCount(0)

  await page.getByLabel('음성').selectOption({ label: '음성 파일 · 四国めたん' })
  await page.getByRole('button', { name: '들어보기' }).click()
  await expect.poll(() => urls.length).toBe(1)
  expect(urls[0]).toContain('/yomenai-audio/metan/')

  // 기기 음성으로 바꾸면 두 설정이 다시 나온다
  await page.getByLabel('음성').selectOption({ label: 'Kyoko' })
  await expect(page.getByRole('group', { name: '소리 속도' })).toBeVisible()
  await expect(page.getByRole('group', { name: '발음 보정' })).toBeVisible()
})

test('파일이 없으면(404) 기기 음성이 대신 읽는다', async ({ page }) => {
  await prepare(page, { files: 'missing' })
  await openSettings(page)
  await page.getByRole('button', { name: '들어보기' }).click()
  await expect.poll(async () => (await state(page)).spoken).toEqual(['がっこう'])
  expect((await state(page)).started).toBe(0)
})

test('음성 파일을 쓰는 상태에서도 기본 사전의 말은 확인 단계에 소리 버튼이 뜬다', async ({ page }) => {
  await prepare(page, { files: 'ok' })
  await page.goto('/')
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  // 소개·확인 질문을 넘기며 읽기 카드에 닿는다 (tts.spec 과 같은 걸음)
  const input = page.locator('.kana-input')
  for (let i = 0; i < 200; i++) {
    if (await input.isVisible().catch(() => false)) break
    for (const name of ['알고 있었다', '봤어요']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) await b.click()
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작' })
      if (!(await again.isVisible().catch(() => false))) break
      await again.click()
    }
    await page.waitForTimeout(100)
  }
  await expect(input).toBeVisible({ timeout: 10_000 })
  await input.fill('aaa')
  await page.getByRole('button', { name: '확인' }).click()
  // 목록을 처음 읽는 동안은 숨겼다가, 기본 사전의 말이라 곧 나타난다
  await expect(page.getByRole('button', { name: /소리 듣기/ })).toBeVisible({ timeout: 10_000 })
})
