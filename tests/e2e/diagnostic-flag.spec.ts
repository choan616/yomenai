// 진입 진단 진입점의 노출 조건 — 플래그(localStorage)가 아니라 기록까지 보고 정한다 (2026-09-07)
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

const DIAG = /진입 진단 시작/

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

/** 세션을 전부 틀리며 완주한다. 밴드 판정이 서기만 하면 되므로 정답 여부는 상관없다 */
async function runSession(page: Page): Promise<void> {
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })
  let replayed = false
  for (let i = 0; i < 160; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      // 첫 세션이 전부 소개였으면 채점 기록이 없다 — 한 번 더 돌려 실제로 푼다 (2026-09-13)
      if (replayed) break
      replayed = true
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작' })
      if (!(await again.isVisible().catch(() => false))) break
      await again.click()
      await page.waitForTimeout(200)
      continue
    }
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    // 처음 만나는 숙어는 소개로 나온다 (2026-09-13) — 보고 넘긴다
    if (await clickIfVisible(page, '봤어요')) continue
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

test('기록이 있으면 진단 진입점을 안 띄우고, 초기화하면 다시 띄운다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  // 정말 처음이면 진단이 주 동작이다
  await expect(page.getByRole('button', { name: DIAG })).toBeVisible()

  // 진단을 건너뛰고 세션만 해도, 밴드 판정이 서면 진단은 더 할 말이 없다
  await runSession(page)
  await expect(page.getByRole('button', { name: DIAG })).toHaveCount(0)

  // ── 동기화로 기록만 받아온 기기 — 플래그(localStorage)는 비어 있고 이벤트만 있다 ──
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: DIAG })).toHaveCount(0)

  // ── 학습 기록 초기화 — 기록이 비었으니 진단을 다시 받을 수 있어야 한다 ──
  await page.getByRole('button', { name: /설정/ }).click()
  // 초기화는 설정에서 한 겹 들어간 「백업과 기록」에 있다 (2026-09-22)
  await page.getByRole('button', { name: /백업과 기록/ }).click()
  await page.getByRole('button', { name: '초기화', exact: true }).click()
  await page.getByRole('button', { name: '정말 초기화', exact: true }).click()
  await expect(page.getByRole('button', { name: DIAG })).toBeVisible({ timeout: 20_000 })
})
