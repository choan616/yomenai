// 뒤따르는 click 이 이웃 키로 가도 글자가 한 번 더 들어가지 않는다 (2026-10-11 사용자 「せきゆ 를 치면 せきゆy 가 입력된다」)
//
// iOS 는 터치 뒤의 click 을 눌린 요소가 아니라 가장 가까운 눌림 요소로 보낼 수 있다(탭 보정). pointerdown 은 u 에서
// 처리했는데 click 이 이웃 y 버튼으로 가면, 「click 만 오는 누름」(스위치 제어·TalkBack)을 받으려고 둔 대체 경로가
// 그것을 새 누름으로 읽어 y 가 한 번 더 들어갔다. 실제 손가락 누름은 pointerdown 이 먼저 오니, 직전에 자판에서
// pointerdown 이 있었으면 그 뒤의 어느 click 도 새 누름이 아니다.
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

async function tap(page: Page, ch: string): Promise<void> {
  const b = await page.locator('.keypad .key', { hasText: new RegExp(`^${ch}$`) }).first().boundingBox()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: b!.x + b!.width / 2, y: b!.y + b!.height / 2, id: 1 }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

test('u 를 누른 뒤 click 이 이웃 y 로 가도 y 가 더 들어가지 않는다 — せきゆ', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  for (const ch of 'sekiy') {
    await tap(page, ch)
    await page.waitForTimeout(60)
  }
  await tap(page, 'u')
  // 탭 보정으로 click 이 이웃 y 버튼에 떨어진 상황을 흉내 낸다
  await page.evaluate(() => (document.querySelector('.keypad .key[data-ch="y"]') as HTMLElement).click())
  await page.waitForTimeout(100)
  await expect(input).toHaveValue('せきゆ')
})

test('click 만 오는 누름(보조 기술)은 여전히 입력된다 — 직전에 손가락 누름이 없을 때', async ({ page }) => {
  await openKeypad(page)
  const input = page.locator('.search-input')
  await input.fill('')
  await page.waitForTimeout(900)
  await page.evaluate(() => (document.querySelector('.keypad .key[data-ch="a"]') as HTMLElement).click())
  await expect(input).toHaveValue('あ')
})
