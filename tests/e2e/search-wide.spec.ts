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

  // **담을 수 있다** (2026-09-23). 담은 밴드 4 는 세션 풀에 들어온다 —
  // 자동 출제는 안 하고 담은 것만 온다
  const row = page.locator('.hit-group .rows > li').filter({ hasText: '陰鬱' }).first()
  await expect(row.locator('.star-btn')).toHaveCount(1)
})

test('기본 범위 숙어는 그대로 담을 수 있다', async ({ page }) => {
  test.setTimeout(180_000)
  await openSearch(page)
  await page.locator('.search-input').fill('めいはく')
  const row = page.locator('.hit-group .rows > li').filter({ hasText: '明白' }).first()
  await expect(row).toBeVisible({ timeout: 120_000 })
  await expect(row.locator('.star-btn')).toHaveCount(1)
})

/**
 * **담은 밴드 4 가 세션에 나온다** (2026-09-23 사용자 요청 「학습범위 밖 표현도 세션에
 * 추가할수없나」).
 *
 * 자동 출제는 안 한다 — 85,418개가 저절로 섞이면 밀도가 확 떨어진다. 「내가 만난 말을
 * 담는다」는 담기의 뜻 그대로 **담은 것만** 온다. 그리고 밴드 4 는 아직 뜻이 없으므로
 * **읽기만** 낸다 (`assignMode` 의 no-meaning).
 */
test('담은 밴드 4 가 세션에 소개로 나오고, 뜻은 안 묻는다', async ({ page }) => {
  test.setTimeout(240_000)
  await openSearch(page)
  await page.locator('.search-input').fill('いんうつ')
  const row = page.locator('.hit-group .rows > li').filter({ hasText: '陰鬱' }).first()
  await expect(row).toBeVisible({ timeout: 120_000 })
  await row.locator('.star-btn').click()
  await expect(row.locator('.star-btn')).toHaveAttribute('aria-pressed', 'true')

  // 담긴 것이 목록에 선다 — 기본 사전 밖인데도 이름이 보여야 한다
  await page.locator('.search-input').fill('')
  await expect(page.locator('.basket .r-main').filter({ hasText: '陰鬱' })).toBeVisible()

  // 세션에서 만난다
  await page.getByRole('button', { name: '홈' }).click()
  await page.getByRole('button', { name: '세션 시작' }).click()
  const head = page.locator('.headword').first()
  await expect(head).toBeVisible({ timeout: 60_000 })
  let met = false
  for (let i = 0; i < 12 && !met; i++) {
    const text = (await head.innerText().catch(() => '')).replace(/\s/g, '')
    if (text.includes('陰鬱')) {
      met = true
      // **뜻 카드가 아니다.** 뜻이 없으니 물을 수 없다
      await expect(page.locator('.card-head .tag').first()).not.toContainText('뜻')
      break
    }
    const next = page.getByRole('button', { name: /알겠어요|다음|모르겠어요/ }).first()
    if (!(await next.isVisible().catch(() => false))) break
    await next.click()
    await page.waitForTimeout(400)
  }
  console.log('세션에서 만났나=' + met)
  expect(met).toBe(true)
})
