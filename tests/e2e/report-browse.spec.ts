// 훑어보기 검증 — 리포트에서 카드 화면으로 들어가 채점 없이 넘겨 본다 (사용자 요청 2026-09-12)
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

test('리포트에서 훑어보기 카드로 들어가 채점 없이 넘긴다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await runSessionWrong(page)

  await page.getByRole('button', { name: /진단 리포트/ }).click()
  await expect(page.locator('.report')).toBeVisible()

  // 리포트엔 진입 버튼만. 목록은 없다
  await expect(page.locator('.browse-row')).toHaveCount(0)
  const enter = page.getByRole('button', { name: /훑어보기 \d+장/ })
  await expect(enter).toBeVisible()
  await enter.click()

  // 카드 화면 — 세션과 같은 셸
  const screen = page.locator('.browse-screen')
  await expect(screen).toBeVisible()
  await expect(screen.locator('.card .headword')).not.toBeEmpty()
  await expect(screen.locator('.card .reading-shown')).not.toBeEmpty()
  await expect(screen.locator('.count')).toContainText('1 /')

  // 출제 요소가 없다
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '알았어요' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '뜻 보기' })).toHaveCount(0)

  // 첫 장에서 이전은 잠겨 있다
  const prev = page.getByRole('button', { name: '‹ 이전' })
  const next = page.getByRole('button', { name: '다음 ›' })
  await expect(prev).toBeDisabled()

  // 넘기면 표제어가 바뀐다
  const first = await screen.locator('.card .headword').innerText()
  await next.click()
  await expect(screen.locator('.count')).toContainText('2 /')
  expect(await screen.locator('.card .headword').innerText()).not.toBe(first)
  await expect(prev).toBeEnabled()

  // 되돌아오면 첫 장
  await prev.click()
  expect(await screen.locator('.card .headword').innerText()).toBe(first)

  // 예문은 목록과 같이 받는다 — 몇 장 넘기는 동안 적어도 한 번은 붙는다
  let sawExample = false
  for (let i = 0; i < 6; i++) {
    if ((await screen.locator('.browse-ex').count()) > 0) {
      sawExample = true
      break
    }
    if (await next.isEnabled()) await next.click()
    else break
  }
  expect(sawExample).toBe(true)

  // 나가면 리포트로 돌아온다 (홈이 아니다)
  await page.getByRole('button', { name: '훑어보기 나가기' }).click()
  await expect(page.locator('.report')).toBeVisible()
})
