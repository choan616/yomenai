// 첫 안내 — 처음 열면 한 번 뜨고, 「알겠어요」 뒤에는 다시 안 뜬다 (테스터 피드백 2026-09-14).
// 모달이 아니라 홈 위의 패널이라, 떠 있는 동안에도 첫 동작에 닿을 수 있어야 한다.
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

test('첫 안내는 한 번만 뜨고, 뜬 동안에도 시작 버튼에 닿는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  const welcome = page.locator('.welcome')
  await expect(welcome).toBeVisible({ timeout: 10_000 })

  // 알아야 할 세 가지가 실제로 적혀 있다 — 테스터가 몰라서 막혔던 것들이다
  await expect(welcome).toContainText('음독')
  await expect(welcome).toContainText('모르겠어요')
  await expect(welcome).toContainText('N2')

  // 가로막지 않는다 — 안내가 떠 있어도 첫 동작이 눌린다
  await expect(
    page.getByRole('button', { name: /진입 진단 시작|세션 시작/ }).first(),
  ).toBeVisible()

  await welcome.getByRole('button', { name: '알겠어요', exact: true }).click()
  await expect(welcome).toHaveCount(0)

  // 새로고침해도 다시 안 뜬다
  await page.reload()
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.welcome')).toHaveCount(0)
})
