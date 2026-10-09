// 자판 연타 보정 (2026-10-09 사용자 보고 「kyuu 가 kyuy 가 된다」, 주로 연타에서 난다).
// 같은 키를 빠르게 두 번 칠 때 엄지가 덜 움직여 둘째 탭이 이웃 키 쪽에 떨어진다 —
// 직전 탭에서 거의 안 움직였는데 키만 바뀌었으면 같은 키로 본다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function openKeypad(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(() => {
    const raw = localStorage.getItem('yomenai:settings')
    const s = raw === null ? {} : JSON.parse(raw)
    localStorage.setItem('yomenai:settings', JSON.stringify({ ...s, keypadLayout: 'compact' }))
  })
  await page.reload()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.locator('.search-input').click()
  await expect(page.locator('.keypad')).toBeVisible()
}

/** 글자 키 안의 (dx, dy) 자리를 터치한다. dx 는 키 왼쪽 가장자리부터, 음수면 왼쪽 이웃 쪽이다 */
async function tapAt(page: Page, ch: string, dx: number, wait = 30): Promise<void> {
  const b = await page.locator('.keypad .key', { hasText: new RegExp(`^${ch}$`) }).first().boundingBox()
  const p = { x: b!.x + dx, y: b!.y + b!.height / 2, id: 1 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(wait)
}

test('같은 키 연타의 둘째 탭이 이웃 키로 새도 같은 키로 친다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', 18)
  await tapAt(page, 'u', 8) // u 왼쪽 가장자리 근처
  await tapAt(page, 'u', -3) // 왼쪽 이웃 y 의 오른쪽 끝에 떨어진다 — 거리 11px
  await expect(input).toHaveValue('きゅう')
})

test('다른 키를 일부러 이어 치면 그대로 친다 — 거리가 멀면 보정하지 않는다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', 18)
  await tapAt(page, 'u', 18)
  await tapAt(page, 'y', 18) // 한 칸 옆을 가운데로 누른다 — 41px 떨어져 있다
  await expect(input).toHaveValue('きゅy')
})

test('연타 사이가 길면 보정하지 않는다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  await tapAt(page, 'u', 8, 600)
  await tapAt(page, 'u', -3)
  await expect(input).toHaveValue('うy')
})
