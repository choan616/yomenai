// 진입 진단 회귀 — 새 문항의 auto-focus 된 입력창에서 빈 답을 Enter 로 제출해도
// 채점·전진되지 않는다. "입력→Enter" 리듬으로 빠르게 치는 사용자가 다음 문항을 읽기 전에
// Enter 를 눌러 빈 답이 오답 처리되던 버그 (context-notes 2026-09-06).
// Phase 9-B 로 '뜻 알았나요?' 단계가 사라졌으므로, 같은 화면(ask)에 머무는지로 확인한다.
import { expect, test } from '@playwright/test'

test('진단에서 빈 답 Enter 는 무시된다', async ({ page }) => {
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
  const headword = page.locator('.diag .headword').first()
  const input = page.locator('.kana-input')
  await expect(headword).toBeVisible({ timeout: 20_000 })

  // 오답 2개까지만 (3개면 적응형 진단이 조기 종료한다)
  for (let n = 0; n < 2; n++) {
    const before = await headword.textContent()

    // auto-focus 된 입력창에 빈 채로 Enter — 무시돼야 한다
    await page.keyboard.press('Enter')
    await page.waitForTimeout(150)
    await expect(input).toBeVisible()
    expect(await headword.textContent()).toBe(before) // 같은 문항에 그대로

    // 실제로 답을 내면(오답이어도) 다음 문항으로 넘어간다
    await input.fill('zzz')
    await input.press('Enter')
    await expect(headword).not.toHaveText(before ?? '', { timeout: 5_000 })
  }
})
