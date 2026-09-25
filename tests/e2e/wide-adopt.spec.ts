// 들이기 — 학습 사전 밖에서 담은 말이 **실제로 세션에 나오는지**까지 본다 (2026-09-25).
//
// 이게 안 되면 넓힌 사전은 조회 전용으로 남는다. 사용자 판단이 「확장보다 단어수집은
// 의미가 없다」였으므로, 세션에 닿는 것이 이 기능의 전부다.
import { expect, test, type Page } from '@playwright/test'

const WORD = '爆轟'

async function fresh(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
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

test('넓힌 사전에서 담은 말이 세션에 나온다', async ({ page }) => {
  test.setTimeout(180_000)
  await fresh(page)

  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByLabel('읽기 또는 한자 검색').fill(WORD)
  await page.getByRole('button', { name: '학습 사전 밖에서 찾기' }).click()

  const row = page.locator('.hit-group.outside .rows > li').filter({ hasText: WORD })
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole('button', { name: `${WORD} 담기` }).click()
  await expect(row.getByRole('button', { name: `${WORD} 빼기` })).toBeVisible()

  await page.getByRole('button', { name: '홈', exact: true }).click()
  await page.getByRole('button', { name: '세션 시작' }).click()

  let met = false
  for (let i = 0; i < 120 && !met; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    const head = page.locator('.headword').first()
    await head.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    const text = await head.textContent().catch(() => null)
    if ((text ?? '').includes(WORD)) met = true
    for (const name of ['봤어요', '알고 있었다', '뜻 보기', '알았어요', 'SKIP', '다음']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(60)
  }
  expect(met).toBe(true)
})
