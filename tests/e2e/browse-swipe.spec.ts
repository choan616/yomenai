// 훑어보기 스와이프 검증 — 손가락으로 좌우로 밀어 카드를 넘긴다 (사용자 요청 2026-09-12)
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true })
test.setTimeout(240_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

/** `.study-main` 위에서 한 손가락으로 (dx, dy) 만큼 민다 */
async function swipe(page: Page, dx: number, dy: number): Promise<void> {
  await page.evaluate(
    ([x, y]) => {
      const el = document.querySelector('.browse-screen .study-main')
      if (el === null) throw new Error('.study-main 없음')
      const box = el.getBoundingClientRect()
      const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
      const touch = (cx: number, cy: number) =>
        new Touch({ identifier: 1, target: el, clientX: cx, clientY: cy })
      el.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [touch(from.x, from.y)],
          changedTouches: [touch(from.x, from.y)],
        }),
      )
      el.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          touches: [],
          changedTouches: [touch(from.x + x, from.y + y)],
        }),
      )
    },
    [dx, dy],
  )
}

test('훑어보기를 스와이프로 넘긴다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
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

  // 세션을 전부 틀리며 완주해 훑어볼 카드를 쌓는다
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
  await page.getByRole('button', { name: '홈으로' }).click()
  await page.getByRole('button', { name: /진단 리포트/ }).click()
  await page.getByRole('button', { name: /훑어보기 \d+장/ }).click()

  const screen = page.locator('.browse-screen')
  await expect(screen).toBeVisible()
  const count = screen.locator('.count')
  const headword = screen.locator('.card .headword')
  await expect(count).toContainText('1 /')
  const first = await headword.innerText()

  // 왼쪽으로 밀면 다음
  await swipe(page, -150, 0)
  await expect(count).toContainText('2 /')
  expect(await headword.innerText()).not.toBe(first)

  // 오른쪽으로 밀면 이전
  await swipe(page, 150, 0)
  await expect(count).toContainText('1 /')
  expect(await headword.innerText()).toBe(first)

  // 첫 장에서 더 뒤로는 안 간다
  await swipe(page, 150, 0)
  await expect(count).toContainText('1 /')

  // 세로가 더 크면 안 넘긴다 — 카드 안을 스크롤하려던 손이다
  await swipe(page, -80, 200)
  await expect(count).toContainText('1 /')

  // 짧게 민 건 안 넘긴다
  await swipe(page, -20, 0)
  await expect(count).toContainText('1 /')
})
