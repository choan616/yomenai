// 한글 키보드로 친 답이 채점되지 않는지 (2026-09-19 사용자 보고).
// 웹은 키보드 언어를 지정할 수 없어서 iOS 가 한글 키보드를 기억해 띄우는 일이 있다.
// 그대로 제출되면 오답으로 기록돼 오답 유형 분포와 복습 일정이 오염된다 — 채점 전에 막는다.
import { expect, test, type Page } from '@playwright/test'

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

test('한글이 섞인 답은 채점되지 않고 안내가 뜬다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)
  const input = page.locator('.kana-input')

  await input.fill('닛쇼우')
  await page.getByRole('button', { name: '확인' }).click()

  // 채점으로 안 넘어간다 — 피드백 카드가 안 뜨고 입력값도 그대로다
  await expect(page.locator('.kbd-warning')).toBeVisible()
  await expect(page.locator('.card.feedback')).toHaveCount(0)
  await expect(input).toHaveValue('닛쇼우')

  // 다시 입력하면 안내가 사라진다
  await input.fill('')
  await input.pressSequentially('ni')
  await expect(page.locator('.kbd-warning')).toHaveCount(0)

  // 로마자로 마저 치면 정상 채점된다
  await input.fill('')
  await input.pressSequentially('aaa')
  await page.getByRole('button', { name: '확인' }).click()
  await expect(page.locator('.card.feedback')).toBeVisible()
})
