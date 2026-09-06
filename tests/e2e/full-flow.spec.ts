// 전체 흐름 완주 검증 — 진입 진단 → 세션 → 리포트. IndexedDB 를 비워 결정론 확보 (PLAN §9)
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

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

test('진입 진단 → 세션 → 리포트 전체 흐름을 완주한다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  // ── 진입 진단 ──
  await page.getByRole('button', { name: /진입 진단 시작/ }).click()
  await expect(page.locator('.diag .headword').first()).toBeVisible({ timeout: 15_000 })

  // 항상 오답 → 밴드 1 에서 오답 3개에 닿아 적응형 진단이 조기 종료한다 (Phase 9-B)
  for (let i = 0; i < 500; i++) {
    if (await page.getByText('진단 완료').isVisible().catch(() => false)) break
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('zzz')
      await input.press('Enter')
      await page.waitForTimeout(20)
      continue
    }
    await page.waitForTimeout(30)
  }

  await expect(page.getByText('진단 완료')).toBeVisible({ timeout: 15_000 })
  // 조기 종료라 결과엔 실제로 푼 밴드만 뜬다. 최소 1개는 있어야 한다
  expect(await page.locator('.bars .bar-row').count()).toBeGreaterThanOrEqual(1)

  // ── 리포트 (진단 결과가 실려 있어야 한다) ──
  await page.getByRole('button', { name: '진단 리포트 보기' }).click()
  await expect(page.locator('.report')).toBeVisible()
  await expect(page.locator('.report-lead')).toContainText('읽기')
  await expect(page.locator('.report-lead')).toContainText('오답')
  await expect(page.getByText('오답 유형 분포')).toBeVisible()
  await expect(page.locator('.ko-callout')).toBeVisible()
  await expect(page.getByText('취약 음독')).toBeVisible()

  // ── 홈: 진단을 마쳤으니 진입점이 사라진다 ──
  await page.getByRole('button', { name: '홈으로' }).click()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible()
  await expect(page.getByRole('button', { name: /진입 진단 시작/ })).toHaveCount(0)

  // ── 세션 완주 ──
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  for (let i = 0; i < 120; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    // 피드백 중이면 다음으로. 입력창이 계속 보이므로(locked) 이 검사가 먼저다
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
  await expect(page.getByText('세션 완료')).toBeVisible({ timeout: 15_000 })

  // ── 리포트 재진입 ──
  await page.getByRole('button', { name: '홈으로' }).click()
  await page.getByRole('button', { name: /진단 리포트/ }).click()
  await expect(page.locator('.report')).toBeVisible()
  await expect(page.getByText('오답 유형 분포')).toBeVisible()
})
