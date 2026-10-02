// 「오늘은 짧게」 토스트 — 22시가 지났는데 오늘 칸이 비었을 때 홈에서 한 번 권한다 (2026-10-02).
//
// 재촉이 죄책감으로 번지지 않게 그은 선을 DOM 에서 못 박는다 — 문턱 전엔 안 뜨고, 오늘 칸을
// 채운 날엔 안 뜨고, 진단 전엔 안 뜨고, 하루에 한 번뿐이다.
// 시계는 월중 날짜에 **고정**한다(`report-attendance.spec.ts` 와 같은 처방) — 시각을 보는
// 기능이라 실제 시계로 돌리면 테스트가 돌리는 시간에 따라 결과가 바뀐다.
import { expect, test, type Page } from '@playwright/test'

/** 그 날 로컬 정오에 채점 `count`개를 심는다 */
async function seedToday(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          const d = new Date()
          d.setHours(12, 0, 0, 0)
          for (let i = 0; i < count; i++) {
            store.put({
              id: `nudge-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: d.getTime() + i,
              idiomId: '1000220',
              cardType: 'reading',
              mistakeType: null,
              deletedAt: null,
              type: 'review',
              grade: 3,
              answer: 'x',
              expected: 'x',
              correct: true,
              elapsedMs: 1000,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    count,
  )
}

/** 시계를 2026-09-15 `hour` 시로 고정하고 홈을 띄운다. `skipIntro` 가 거짓이면 진단 전 상태다 */
async function boot(page: Page, hour: number, skipIntro = true): Promise<void> {
  await page.clock.setFixedTime(new Date(2026, 8, 15, hour, 0, 0))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate((skipIntro) => {
    if (skipIntro) localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  }, skipIntro)
}

/** 계산이 끝났다 — 주 동작이 눌릴 수 있게 되면 미리보기가 들어온 것이다 */
async function previewReady(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 60_000 })
}

test('문턱 전에는 안 뜬다', async ({ page }) => {
  await boot(page, 21)
  await page.reload()
  await previewReady(page)
  await expect(page.locator('.nudge-toast')).toHaveCount(0)
})

test('문턱이 지나면 뜨고, 「3장만」이 짧은 세션으로 간다', async ({ page }) => {
  await boot(page, 23)
  await page.reload()
  await expect(page.locator('.nudge-toast')).toBeVisible({ timeout: 60_000 })
  // 띠가 바로 위에서 약속을 말하므로 토스트는 같은 문장을 쓰지 않는다
  await expect(page.locator('.nudge-toast')).toContainText('오늘은 짧게')
  await page.locator('.nudge-toast').getByRole('button', { name: /3장만/ }).click()
  await expect(page.locator('.study-bar .count')).toContainText('/ 3', { timeout: 30_000 })
})

test('닫으면 사라지고, 다시 들어와도 그날은 안 뜬다', async ({ page }) => {
  await boot(page, 23)
  await page.reload()
  const toast = page.locator('.nudge-toast')
  await expect(toast).toBeVisible({ timeout: 60_000 })
  await toast.getByRole('button', { name: '닫기' }).click()
  await expect(toast).toHaveCount(0)

  await page.reload()
  await previewReady(page)
  await expect(toast).toHaveCount(0)
})

test('오늘 칸을 이미 채운 날에는 안 뜬다', async ({ page }) => {
  await boot(page, 23)
  await seedToday(page, 3)
  await page.reload()
  await previewReady(page)
  await expect(page.locator('.nudge-toast')).toHaveCount(0)
})

test('진단 전에는 안 뜬다 — 먼저 할 일이 있는 상태다', async ({ page }) => {
  await boot(page, 23, false)
  await page.reload()
  // 진단 분기의 주 동작은 진단이고, 세션은 건너뛰기용으로 아래에 있다
  await expect(page.getByRole('button', { name: /진입 진단 시작/ })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /진단 건너뛰기/ })).toBeEnabled({ timeout: 60_000 })
  await expect(page.locator('.nudge-toast')).toHaveCount(0)
})

test('가만히 두면 스스로 사라진다', async ({ page }) => {
  await boot(page, 23)
  await page.reload()
  const toast = page.locator('.nudge-toast')
  await expect(toast).toBeVisible({ timeout: 60_000 })
  // 시계는 Date 만 고정한다 — 타이머는 실제 시간으로 흐르므로 8초 뒤에 스스로 접힌다
  await expect(toast).toHaveCount(0, { timeout: 15_000 })
})

test('탭바와 주 동작을 안 가린다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await boot(page, 23)
  await page.reload()
  const toast = page.locator('.nudge-toast')
  await expect(toast).toBeVisible({ timeout: 60_000 })
  const t = (await toast.boundingBox())!
  const bar = (await page.locator('.tabbar').boundingBox())!
  const primary = (await page.locator('.home .btn-primary.big').boundingBox())!
  // 탭바 위에 떠서 탭을 안 덮고, 주 동작(세션 시작)도 안 덮는다
  expect(Math.round(t.y + t.height)).toBeLessThanOrEqual(Math.round(bar.y))
  expect(Math.round(primary.y + primary.height)).toBeLessThanOrEqual(Math.round(t.y))
})
