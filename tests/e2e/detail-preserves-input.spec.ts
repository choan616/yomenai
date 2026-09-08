// 오답에서 "자세히" 를 열었다 닫아도 입력창의 답이 남아 있어야 한다 (KanaInput 리마운트 대비)
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

test('오답 상세를 닫고 돌아오면 입력한 답이 그대로 남아 있다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  // 진단을 건너뛰고 바로 세션으로
  const skip = page.getByRole('button', { name: /세션 시작 · 진단 건너뛰기/ })
  if (await skip.isVisible().catch(() => false)) await skip.click()
  else await page.getByRole('button', { name: '세션 시작', exact: true }).click()

  // 읽기 카드가 나올 때까지 진행 (뜻 카드는 넘긴다)
  const input = page.locator('.kana-input')
  for (let i = 0; i < 40; i++) {
    if (await input.isVisible().catch(() => false)) break
    const known = page.getByRole('button', { name: '알고 있었다', exact: true })
    if (await known.isVisible().catch(() => false)) {
      await known.click()
      continue
    }
    await page.waitForTimeout(50)
  }
  await expect(input).toBeVisible()

  // 확실한 오답을 넣는다
  await input.fill('xxxxx')
  await input.press('Enter')
  await expect(page.locator('.card.feedback.is-ng')).toBeVisible({ timeout: 10_000 })

  // 채점 뒤 입력창에 남은 값 (wanakana 변환 결과)
  const answered = await input.inputValue()
  expect(answered).not.toBe('')

  // 자세히 열기 → 닫기
  await page.getByRole('button', { name: '자세히', exact: true }).click()
  await expect(page.locator('.mistake-detail')).toBeVisible()
  await page.getByRole('button', { name: '닫기', exact: true }).click()

  // 돌아왔을 때 입력창 값이 그대로여야 한다
  await expect(page.locator('.card.feedback.is-ng')).toBeVisible()
  expect(await page.locator('.kana-input').inputValue()).toBe(answered)
})
