// 진입 진단 회귀 — 새 문항의 auto-focus 된 입력창에서 빈 답을 Enter 로 제출해도
// 오답 채점되지 않는다. "입력→Enter" 리듬으로 빠르게 치는 사용자가 다음 문항을 읽기 전에
// Enter 를 눌러 해설(known)로 튀던 버그 (context-notes 2026-09-06).
import { expect, test } from '@playwright/test'

test('진단에서 빈 답 Enter 는 채점되지 않는다', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
    await new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.reload()

  await page.getByRole('button', { name: /진입 진단 시작/ }).click({ timeout: 20_000 })
  await expect(page.locator('.diag .headword').first()).toBeVisible({ timeout: 20_000 })

  const input = page.locator('.kana-input')
  const known = page.getByRole('button', { name: '알고 있었다', exact: true })

  for (let n = 0; n < 6; n++) {
    await expect(input).toBeVisible()

    // 오답을 Enter 로 제출 → 해설(known) 진입
    await input.fill('zzz')
    await input.press('Enter')
    await expect(known).toBeVisible()

    // "알고 있었다" 클릭 후, 새 입력창이 auto-focus 되자마자 빈 채로 Enter
    await known.click()
    await expect(input).toBeVisible()
    await page.keyboard.press('Enter')

    // 빈 답은 무시돼야 한다 — 해설로 넘어가지 않고 입력창이 그대로다
    await expect(known).toHaveCount(0)
    await expect(input).toBeVisible()
  }
})
