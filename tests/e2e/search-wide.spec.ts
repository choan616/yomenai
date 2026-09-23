// 찾기가 밴드 4까지 본다 (2026-09-23 사용자 보고 「いんうつ 같은 표현은 있을법한데 없다」).
//
// 陰鬱 은 사전에 **있었다.** 다만 밴드 4(빈도 순위 없음)라 앱이 닿지 못했다 —
// band4.json(20MB)을 아무 데서도 안 불렀다. 밴드는 어려움이 아니라 뉴스 코퍼스 빈도로
// 갈리므로, 일상어인 憂鬱 도 밴드 4다. **찾기는 학습이 아니라 조회라** 출제 범위와
// 찾을 수 있는 범위가 같을 이유가 없다.
import { expect, test, type Page } from '@playwright/test'

async function openSearch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '찾기' }).click()
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()
}

test('밴드 4 숙어를 읽기로 찾는다', async ({ page }) => {
  test.setTimeout(180_000)
  await openSearch(page)
  // 열자마자는 기본 범위다 — 20MB 를 화면 여는 값으로 치르지 않는다
  await expect(page.locator('.search-scope')).toContainText('16,959')

  await page.locator('.search-input').fill('いんうつ')
  // 넓은 사전이 오면 결과가 뜬다
  await expect(page.locator('.hit-group .r-main')).toContainText('陰鬱', { timeout: 120_000 })
  console.log('찾은 것=' + (await page.locator('.hit-group .r-main').first().innerText()))

  // 밴드 4 는 출제 범위 밖이라 담기를 안 낸다. 담아도 세션에 안 나온다
  const row = page.locator('.hit-group .rows > li').filter({ hasText: '陰鬱' }).first()
  await expect(row.locator('.star-slot')).toHaveText('학습 범위 밖')
  await expect(row.locator('.star-btn')).toHaveCount(0)
})

test('기본 범위 숙어는 그대로 담을 수 있다', async ({ page }) => {
  test.setTimeout(180_000)
  await openSearch(page)
  await page.locator('.search-input').fill('めいはく')
  const row = page.locator('.hit-group .rows > li').filter({ hasText: '明白' }).first()
  await expect(row).toBeVisible({ timeout: 120_000 })
  await expect(row.locator('.star-btn')).toHaveCount(1)
})
