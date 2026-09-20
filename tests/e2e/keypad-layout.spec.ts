// 자판 배열 설정 (2026-09-20 사용자 요청). 안 쓰는 l·q·v·x 를 빼면 남은 키가 커진다 —
// 그 이득이 실제로 나는지, 그리고 뺀 글자로는 못 치게 되는 게 아닌지 잰다.
import { expect, test, type Page } from '@playwright/test'

// 배열을 소스에서 import 하지 않고 여기 적는다 — 소스가 바뀌면 이 테스트가 같이 바뀌어
// 통과해 버리면 회귀를 못 잡는다
type KeypadLayout = 'qwerty' | 'compact'
const KEYPAD_ROWS: Record<KeypadLayout, string[]> = {
  qwerty: ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'],
  compact: ['wertyuiop', 'asdfghjk', 'zcbnm'],
}

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function setLayout(page: Page, layout: KeypadLayout): Promise<void> {
  await page.evaluate((l) => {
    const raw = localStorage.getItem('yomenai:settings')
    const s = raw === null ? {} : JSON.parse(raw)
    localStorage.setItem('yomenai:settings', JSON.stringify({ ...s, keypadLayout: l }))
  }, layout)
  await page.reload()
}

async function openSearchKeypad(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.locator('.search-input').click()
  await expect(page.locator('.keypad')).toBeVisible()
}

test('간결 배열은 안 쓰는 넷을 빼고 키가 넓어진다 — 줄 구성은 그대로다', async ({ page }) => {
  await page.goto('/')
  const widths: Record<string, number> = {}

  for (const layout of ['qwerty', 'compact'] as const) {
    await setLayout(page, layout)
    await openSearchKeypad(page)
    const keypad = page.locator('.keypad')

    // 그 배열이 내놓는 글자가 화면에 그대로 있다
    const letters = KEYPAD_ROWS[layout].join('')
    const shown = (await keypad.locator('.key').allInnerTexts())
      .map((t) => t.trim())
      .filter((t) => /^[a-z]$/.test(t))
    expect(shown.sort().join('')).toBe([...letters].sort().join(''))

    // 안 쓰는 넷은 간결·넓게에서 빠진다
    for (const gone of ['l', 'q', 'v', 'x']) {
      await expect(keypad.getByRole('button', { name: gone, exact: true })).toHaveCount(
        layout === 'qwerty' ? 1 : 0,
      )
    }

    widths[layout] = (await keypad.getByRole('button', { name: 'w', exact: true }).boundingBox())!.width
  }

  console.log('키 폭:', JSON.stringify(widths))
  // 키를 키우려고 만든 배열이다 — 실제로 커져야 한다
  expect(widths.compact).toBeGreaterThan(widths.qwerty)
})

test('간결 배열로도 읽기를 그대로 친다 — 뺀 글자가 필요 없다', async ({ page }) => {
  await page.goto('/')
  await setLayout(page, 'compact')
  await openSearchKeypad(page)
  const keypad = page.locator('.keypad')
  const input = page.locator('.search-input')

  // し(shi)·つ(tsu)·ちゃ(cha) — 대체 표기까지 남은 글자로 된다
  for (const ch of ['s', 'h', 'i']) await keypad.getByRole('button', { name: ch, exact: true }).click()
  await expect(input).toHaveValue('し')
  for (const ch of ['t', 's', 'u']) await keypad.getByRole('button', { name: ch, exact: true }).click()
  await expect(input).toHaveValue('しつ')
  for (const ch of ['c', 'h', 'a']) await keypad.getByRole('button', { name: ch, exact: true }).click()
  await expect(input).toHaveValue('しつちゃ')
})
