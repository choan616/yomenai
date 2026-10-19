// PC 키보드: 답을 치고 Enter → 채점, 정답·오답 화면에서 Enter → 다음. 「자세히」는 클릭으로만 연다
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

async function resetState(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
    return new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.reload()
}

test('오답 화면에서 Enter 는 다음, 자세히는 클릭으로만 열린다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  const skip = page.getByRole('button', { name: /세션 시작 · 진단 건너뛰기/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  else await page.getByRole('button', { name: '세션 시작', exact: true }).click()

  // 읽기 카드가 나올 때까지 진행 (소개·뜻 카드는 넘긴다)
  const input = page.locator('.kana-input')
  for (let i = 0; i < 200; i++) {
    if (await input.isVisible().catch(() => false)) break
    const seen = page.getByRole('button', { name: '봤어요', exact: true })
    if (await seen.isVisible().catch(() => false)) {
      await seen.click()
      continue
    }
    const known = page.getByRole('button', { name: '알고 있었다', exact: true })
    if (await known.isVisible().catch(() => false)) {
      await known.click()
      continue
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작' })
      if (!(await again.isVisible().catch(() => false))) break
      await again.click()
      await page.waitForTimeout(200)
      continue
    }
    await page.waitForTimeout(50)
  }
  await expect(input).toBeVisible()

  // 확실한 오답 → Enter 로 제출. 같은 Enter 가 곧장 다음까지 넘기면 안 된다
  const count = page.locator('.study-bar .count')
  await input.fill('xxxxx')
  await input.press('Enter')
  const feedback = page.locator('.card.feedback.is-ng')
  await expect(feedback).toBeVisible({ timeout: 10_000 })
  const before = await count.innerText()
  await page.waitForTimeout(400)
  await expect(feedback).toBeVisible()

  // 자세히를 클릭으로 열면 포커스가 버튼으로 간다. 그 상태의 Enter 는 상세를 건드리지 않는다
  await page.getByRole('button', { name: '자세히', exact: true }).click()
  await expect(page.locator('.mistake-detail')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(page.locator('.mistake-detail')).toBeVisible()
  await expect(count).toHaveText(before)
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.locator('.mistake-detail')).toBeHidden()

  // 포커스가 입력창이 아니어도 Enter 는 다음이다 — 「자세히」를 다시 열어 주지 않는다
  await page.getByRole('button', { name: '자세히', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(count).not.toHaveText(before)
  await expect(page.locator('.mistake-detail')).toBeHidden()
})
