// 자판의 이웃 키 혼동 보정 — 키 경계 근처 탭은 지금까지 친 로마자가 음절이 되는 쪽으로 고른다
// (2026-10-09 「kyuu 가 kyuy 가 된다」, 2026-10-11 「kyuu 가 kyy 가 된다」).
//
// 처음 안은 「직전 탭에서 거의 안 움직였는데 키가 바뀌면 같은 키」였다. y→u 처럼 이웃 키를 경계 근처에서 빠르게
// 연달아 치면 둘이 합쳐져(kyyy) 걷었다 — 두 탭이 가깝다는 것만으로는 「같은 키 연타」와 「이웃 키를 연달아」를
// 못 가른다. 지금은 눌린 글자와 이웃 글자 중 로마자가 말이 되는 쪽을 고르고(ky 뒤 y 는 안 된다),
// 둘 다 되면 방금 친 같은 키의 연타로 본다(kyu 뒤 u/y).
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

/** 글자 키 `ch` 의 왼쪽 가장자리에서 dx px 자리를 터치한다. 음수면 왼쪽 이웃 키 쪽이다 */
async function tapAt(page: Page, ch: string, dx: number, wait = 30): Promise<void> {
  const b = await page.locator('.keypad .key', { hasText: new RegExp(`^${ch}$`) }).first().boundingBox()
  const p = { x: b!.x + dx, y: b!.y + b!.height / 2, id: 1 }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForTimeout(wait)
}

/** 키 폭 — 가장자리 가까운 자리를 폭에서 잰다 */
async function keyWidth(page: Page, ch: string): Promise<number> {
  return (await page.locator('.keypad .key', { hasText: new RegExp(`^${ch}$`) }).first().boundingBox())!.width
}

test('y 다음 u 를 경계 근처에서 빠르게 쳐도 합쳐지지 않는다 — kyuu 가 kyy 가 되던 자리', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  const w = await keyWidth(page, 'y')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', w - 4) // y 의 오른쪽 끝
  await tapAt(page, 'u', 4) // u 의 왼쪽 끝 — 둘 사이 13px
  await tapAt(page, 'u', 4)
  await expect(input).toHaveValue('きゅう')
})

test('ky 뒤에서 u 를 누르려다 경계 너머 y 에 떨어져도 u 로 친다 — kyy 는 음절이 못 된다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  const w = await keyWidth(page, 'y')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', 18)
  await tapAt(page, 'y', w - 3) // 눌린 것은 y 의 오른쪽 끝(u 쪽 가장자리)이지만 ky 뒤 y 는 말이 안 된다
  await expect(input).toHaveValue('きゅ')
})

test('같은 키 연타(uu)의 둘째 탭이 이웃 y 에 떨어져도 u 로 친다 — 둘 다 말이 되지만 방금 친 키의 연타다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  const w = await keyWidth(page, 'y')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', 18)
  await tapAt(page, 'u', 8) // u 왼쪽 가장자리 근처
  await tapAt(page, 'y', w - 3) // 연타인데 y 의 오른쪽 끝에 떨어졌다
  await expect(input).toHaveValue('きゅう')
})

test('가운데를 눌러 다른 키를 일부러 이어 치면 그대로 친다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  await tapAt(page, 'k', 18)
  await tapAt(page, 'y', 18)
  await tapAt(page, 'u', 18)
  await tapAt(page, 'y', 18) // 한 칸 옆을 가운데로 누른다 — 가장자리가 아니라 보정 대상이 아니다
  await expect(input).toHaveValue('きゅy')
})

test('연타 사이가 길면 방금 친 키로 보지 않는다 — 눌린 대로 친다', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  const w = await keyWidth(page, 'y')
  await input.fill('')
  await tapAt(page, 'u', 8, 600)
  await tapAt(page, 'y', w - 3)
  await expect(input).toHaveValue('うy')
})
