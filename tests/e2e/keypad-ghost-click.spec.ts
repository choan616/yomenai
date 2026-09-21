// 확인 키를 손가락으로 눌렀을 때 채점 화면이 바로 사라지지 않는지 (사용자 실기기 보고
// 2026-09-21, 안드로이드 11 크롬 PWA "정답 유무 화면이 금방 사라진다").
//
// 확인 키는 pointerdown 에서 채점한다. pointerdown 을 preventDefault 해도 click 은 그대로
// 오는데, 그 사이 자판이 접히고 같은 자리에 「다음」이 올라와 있어 손을 떼는 순간
// 「다음」이 눌린다. 마우스 click 으로는 재현되지 않는다 — 반드시 tap 이어야 한다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function reachReadingCard(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()
  const input = page.locator('.kana-input')
  for (let i = 0; i < 200; i++) {
    if (await input.isVisible().catch(() => false)) break
    for (const name of ['알고 있었다', '봤어요']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {})
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작' })
      if (await again.isVisible().catch(() => false)) await again.click()
    }
    await page.waitForTimeout(80)
  }
  await expect(input).toBeVisible({ timeout: 15_000 })
}

test('확인 키를 탭해도 채점 화면이 남아 있다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)

  const keypad = page.locator('.keypad')
  await expect(keypad).toBeVisible()
  await keypad.getByRole('button', { name: 'k', exact: true }).tap()
  await keypad.getByRole('button', { name: 'a', exact: true }).tap()
  await expect(page.locator('.kana-input')).toHaveValue('か')

  await keypad.getByRole('button', { name: '확인', exact: true }).tap()

  // 유령 클릭이 있으면 여기서 이미 다음 카드로 넘어가 있다
  await page.waitForTimeout(500)
  await expect(page.locator('.card.feedback'), '채점 화면이 유지돼야 한다').toBeVisible()
})

test('먹는 클릭은 하나뿐 — 바로 이어 「다음」을 탭하면 넘어간다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)

  const keypad = page.locator('.keypad')
  await keypad.getByRole('button', { name: 'k', exact: true }).tap()
  await keypad.getByRole('button', { name: '확인', exact: true }).tap()
  await expect(page.locator('.card.feedback')).toBeVisible()

  await page.getByRole('button', { name: '다음', exact: true }).tap()
  await expect(page.locator('.card.feedback')).toHaveCount(0)
})
