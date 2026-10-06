// 리포트 요약 타일 → 하단 시트, 처방 카드 줄, 더 보기 (2026-10-05) — 요약 먼저, 상세는 시트로
import { expect, test, type Page } from '@playwright/test'
import { closeSheet } from './report-sheets.js'

/** 어제까지 이어진 `days` 일, 하루 4개(그중 하나는 틀린 것: 음독 선택)를 심는다 */
async function seed(page: Page, days: number): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(
    (days) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let d = 1; d <= days; d++) {
            const at = new Date()
            at.setDate(at.getDate() - d)
            at.setHours(12, 0, 0, 0)
            for (let i = 0; i < 4; i++) {
              const wrong = i === 0
              store.put({
                id: `sheet-${d}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                at: at.getTime() + i,
                idiomId: '1000220',
                cardType: 'reading',
                mistakeType: wrong ? 'ONYOMI_CHOICE' : null,
                deletedAt: null,
                type: 'review',
                grade: wrong ? 1 : 3,
                answer: wrong ? 'x' : 'めいはく',
                expected: 'めいはく',
                correct: !wrong,
                elapsedMs: 1000,
              })
            }
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    days,
  )
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.summary .tile')).toHaveCount(4, { timeout: 20_000 })
}

test('요약 타일 넷이 첫 화면에 있고 값이 채워져 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page, 5)
  const tiles = page.locator('.summary .tile')
  await expect(tiles.nth(0)).toContainText('수준')
  await expect(tiles.nth(1)).toContainText('전체 정답률')
  await expect(tiles.nth(1)).toContainText('75%')
  await expect(tiles.nth(2)).toContainText('학습한 날')
  await expect(tiles.nth(2)).toContainText('5일째')
  await expect(tiles.nth(3)).toContainText('많이 틀린 유형')
  // 넷이 모두 첫 화면(스크롤 없이) 안에 든다
  for (let i = 0; i < 4; i++) {
    const b = (await tiles.nth(i).boundingBox())!
    expect(b.y + b.height).toBeLessThanOrEqual(844)
  }
})

test('타일을 누르면 상세가 하단 시트로 열리고 Esc 로 닫힌다', async ({ page }) => {
  await seed(page, 5)
  const dialog = page.getByRole('dialog')

  await page.locator('.summary .tile').nth(0).click()
  await expect(dialog).toHaveAccessibleName('수준')
  await expect(page.locator('.ladder')).toBeVisible()
  await closeSheet(page)

  // 정답률 타일도 수준 시트를 연다 (정답률은 수준 구역 안에 있다)
  await page.locator('.summary .tile').nth(1).click()
  await expect(dialog).toHaveAccessibleName('수준')
  await closeSheet(page)

  await page.locator('.summary .tile').nth(2).click()
  await expect(dialog).toHaveAccessibleName('학습한 날')
  await expect(page.locator('.cal-grid')).toBeVisible() // 시트 안의 달력은 처음부터 열려 있다
  await closeSheet(page)

  await page.locator('.summary .tile').nth(3).click()
  await expect(dialog).toHaveAccessibleName('오답 유형')
  await expect(page.locator('.bars')).toBeVisible()
  // 다시보기 진입은 오답 유형 시트가 아니라 다시보기 시트에 있다 (2026-10-05)
  await expect(page.getByRole('button', { name: /무작위 다시보기/ })).toHaveCount(0)
  // 바깥(배경)을 눌러도 닫힌다
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 40 } })
  await expect(dialog).toHaveCount(0)
})

test('더 보기 줄: 읽기 규칙·음독 맵은 화면으로, 취약 음독·다시보기는 시트로', async ({ page }) => {
  await seed(page, 5)
  const more = page.locator('.tools')
  await expect(more.locator('.section-title')).toHaveText('더 보기')
  await expect(more.getByRole('button', { name: /읽기 규칙/ })).toBeVisible()
  await expect(more.getByRole('button', { name: /음독 맵/ })).toBeVisible()

  await more.getByRole('button', { name: /^다시보기/ }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('다시보기')
  await expect(page.getByRole('button', { name: /무작위 다시보기/ })).toBeVisible()
  await expect(page.locator('.bars')).toHaveCount(0)
  await closeSheet(page)

  // 취약 음독이 있으면 줄이 나오고, 시트에서는 목록이 처음부터 펼쳐져 있다
  const weak = more.getByRole('button', { name: /^취약 음독/ })
  if ((await weak.count()) > 0) {
    await weak.click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('취약 음독')
    await expect(page.locator('.weak-onyomi .rows li').first()).toBeVisible()
  }
})

test('다음에 볼 것은 옆으로 미는 카드 줄이다 (스냅)', async ({ page }) => {
  await seed(page, 5)
  const list = page.locator('.rx-rail .rx-list')
  await expect(list).toBeVisible()
  expect(await list.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x')
  expect(await list.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row')
})

test('다음에 볼 것 — 마우스 기기에서는 화살표로, 키보드로는 ←/→ 로 넘긴다', async ({ page }) => {
  // 읽기 30개 이상이어야 처방이 선다 — 8일 × 4 = 32개
  await seed(page, 8)
  const list = page.locator('.rx-rail .rx-list')
  await expect(list).toBeVisible()
  expect(await list.locator('> li').count()).toBeGreaterThanOrEqual(2)
  const prev = page.getByRole('button', { name: '이전 카드' })
  const next = page.getByRole('button', { name: '다음 카드' })
  // 처음에는 이전이 막혀 있다
  await expect(prev).toBeDisabled()
  await expect(next).toBeEnabled()
  await next.click()
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await expect(prev).toBeEnabled()
  await prev.click()
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeLessThan(5)
  await expect(prev).toBeDisabled()
  // 키보드: 줄에 포커스를 두고 →
  await list.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeLessThan(5)
})

test('다음에 볼 것 — 터치 기기에서는 화살표를 안 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } })
  const page = await ctx.newPage()
  await seed(page, 8)
  await expect(page.locator('.rx-rail .rx-list')).toBeVisible()
  // 점 줄(=카드가 둘 이상)은 있는데 화살표만 안 보인다
  await expect(page.locator('.rx-dots')).toBeVisible()
  await expect(page.locator('.rx-arrow')).toHaveCount(2)
  await expect(page.locator('.rx-arrow').first()).toBeHidden()
  await ctx.close()
})
