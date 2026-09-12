// 리포트 훑어보기 검증 — 자주 틀린 숙어를 채점 없이 펼쳐 본다 (사용자 요청 2026-09-12)
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

/** 세션을 전부 틀리며 완주한다 — 훑어보기 목록이 차야 한다 */
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

test('리포트에서 자주 틀린 숙어를 펼쳐 읽기·뜻·예문을 본다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await runSessionWrong(page)

  await page.getByRole('button', { name: /진단 리포트/ }).click()
  await expect(page.locator('.report')).toBeVisible()

  const section = page.locator('.browse')
  await expect(section).toBeVisible()
  const rows = section.locator('.browse-row')
  expect(await rows.count()).toBeGreaterThan(0)

  // 접힌 상태 — 표제어와 오답 횟수만
  const head = rows.first().locator('.browse-head')
  await expect(head).toHaveAttribute('aria-expanded', 'false')
  await expect(head.locator('.r-tail')).toContainText('회 틀림')
  await expect(section.locator('.browse-body')).toHaveCount(0)

  // 펼치면 읽기가 나온다. 출제·채점 요소는 없다
  await head.click()
  await expect(head).toHaveAttribute('aria-expanded', 'true')
  const body = rows.first().locator('.browse-body')
  await expect(body.locator('.browse-reading')).not.toBeEmpty()
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '알았어요' })).toHaveCount(0)

  // 한 번에 하나만 펼친다
  if ((await rows.count()) > 1) {
    await rows.nth(1).locator('.browse-head').click()
    await expect(head).toHaveAttribute('aria-expanded', 'false')
    await expect(section.locator('.browse-body')).toHaveCount(1)
  }

  // 예문은 지연 로드 — 적어도 하나의 행에는 붙어야 한다 (examples.json 은 11,217 숙어 보유)
  let sawExample = false
  const n = Math.min(await rows.count(), 6)
  for (let i = 0; i < n; i++) {
    await rows.nth(i).locator('.browse-head').click()
    if ((await rows.nth(i).locator('.browse-ex').count()) > 0) {
      sawExample = true
      break
    }
  }
  expect(sawExample).toBe(true)
})
