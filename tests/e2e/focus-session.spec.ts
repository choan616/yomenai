// 리포트 처방 → 집중 세션 진입 검증 (Phase 10). 취약 음독이 잡힐 만큼 표본을 쌓은 뒤 본다
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

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

/** 세션을 끝까지 틀리며 완주한다. 취약 음독을 만들어야 처방이 실행 가능한 항목을 낸다 */
async function runSessionWrong(page: Page): Promise<void> {
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })
  for (let i = 0; i < 160; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '알고 있었다')) continue
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('tadashii')
      await input.press('Enter')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '뜻 보기')) continue
    if (await clickIfVisible(page, '알았어요')) continue
    await page.waitForTimeout(30)
  }
  await expect(page.getByText('세션 완료')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '홈으로' }).click()
}

test('리포트의 처방에서 집중 세션으로 바로 들어간다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  // 진단은 건너뛰고 세션만 반복한다 — 필요한 건 밴드 판정이 아니라 음독 노출 횟수다
  for (let i = 0; i < 3; i++) await runSessionWrong(page)

  await page.getByRole('button', { name: /진단 리포트/ }).click()
  await expect(page.locator('.report')).toBeVisible()
  await expect(page.getByText('취약 음독')).toBeVisible()

  const run = page.locator('.rx-run').first()
  await expect(run).toBeVisible()
  // 처방이 가리킨 음독이 곧 세션의 대상이다
  const kanji = await page.locator('.rx-list > li').filter({ has: page.locator('.rx-run') })
    .first().locator('.rx-title').innerText()

  await run.click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 15_000 })
  // 집중 세션의 카드는 전부 그 한자를 품고 있어야 한다
  const target = kanji.trim().charAt(0)
  for (let i = 0; i < 3; i++) {
    const head = await page.locator('.headword').first().innerText()
    expect(head, `${head} 에 ${target} 가 없다`).toContain(target)
    const input = page.locator('.kana-input')
    if (!(await input.isVisible().catch(() => false))) break
    await input.fill('tadashii')
    await input.press('Enter')
    await clickIfVisible(page, '다음')
    await page.waitForTimeout(60)
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
  }
})
