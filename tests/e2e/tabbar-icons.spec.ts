// 하단 탭바는 아이콘 위에 글자다 (2026-10-11 사용자 요청) — 아이콘은 장식이고 버튼 이름은 글자가 맡는다
import { expect, test } from '@playwright/test'

test('탭마다 아이콘과 글자가 있고, 아이콘은 읽어 주지 않는다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.reload()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })

  const items = page.locator('.tabbar-item')
  await expect(items).toHaveCount(4)
  for (const [i, label] of ['홈', '리포트', '찾기', '설정'].entries()) {
    const item = items.nth(i)
    await expect(item.locator('svg.icon')).toHaveCount(1)
    await expect(item.locator('svg.icon')).toHaveAttribute('aria-hidden', 'true')
    await expect(item.locator('.tabbar-label')).toHaveText(label)
    // 버튼 이름은 글자 그대로다 — 아이콘이 이름에 섞이지 않는다
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(1)
  }

  // 아이콘이 글자 위에 선다
  const box = async (sel: string) => (await items.nth(1).locator(sel).boundingBox())!
  const icon = await box('svg.icon')
  const label = await box('.tabbar-label')
  expect(icon.y + icon.height).toBeLessThanOrEqual(label.y + 1)
  // 아이콘 크기는 글자 크기 설정과 무관하게 24px 다
  await page.evaluate(() => document.documentElement.setAttribute('data-text-scale', 'lg'))
  const big = await box('svg.icon')
  expect(Math.round(big.width)).toBe(24)

  // 선택된 탭은 색만으로 구분하지 않는다 — 굵기와 윗줄이 같이 선다
  await items.nth(1).click()
  await expect(items.nth(1)).toHaveClass(/on/)
  await expect(items.nth(1)).toHaveAttribute('aria-current', 'page')
  const shadow = await items.nth(1).evaluate((el) => getComputedStyle(el).boxShadow)
  expect(shadow).not.toBe('none')
})
