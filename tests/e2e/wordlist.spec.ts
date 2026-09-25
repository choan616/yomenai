// 단어장 (2026-09-25 사용자 요청 「단어장 기능도 만들고 싶다」).
//
// 못 박는 것 셋 — **학습을 시작해도 안 사라진다**(찾기의 대기열과 다른 점이다),
// 묶음을 만들어 옮길 수 있다, 메모가 남는다.
import { expect, test, type Page } from '@playwright/test'

const DAY = 86_400_000

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  // 담아 둔 것 하나 + 그중 하나는 이미 학습을 시작했다
  await page.evaluate(
    (day) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const st = req.result.transaction('events', 'readwrite').objectStore('events')
          st.put({
            id: 'wl-1', userId: 'local', deviceId: 'e2e', at: Date.now() - 2 * day,
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.put({
            id: 'wl-2', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'review', grade: 3, answer: 'x', expected: 'x', correct: true, elapsedMs: 900,
          })
          st.put({
            id: 'wl-3', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1150680', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.transaction.oncomplete = () => res()
          st.transaction.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    DAY,
  )
  await page.reload()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible()
}

test('학습을 시작해도 단어장에는 남는다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)

  const rows = page.locator('.review-row')
  await expect(rows).toHaveCount(2, { timeout: 60_000 })

  // 찾기의 「담아 둔 표현」은 세션에 나온 순간 사라진다. 여기서는 상태를 달고 남는다
  const started = rows.filter({ hasText: '明白' })
  await expect(started.locator('.wl-state')).toHaveText('학습 중')
  await expect(rows.filter({ hasText: '愛好' }).locator('.wl-state')).toHaveText('아직 안 나옴')
})

test('묶음을 만들어 옮기고, 메모를 남긴다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  await expect(page.locator('.review-row').first()).toBeVisible({ timeout: 60_000 })

  // 처음엔 전부 기본 묶음이다 — 묶음을 안 준 옛 이벤트도 여기로 온다
  await expect(page.locator('.wl-group .section-title')).toHaveCount(1)
  await expect(page.locator('.wl-group .section-title')).toContainText('기본')

  await page.getByRole('button', { name: '+ 새 묶음' }).click()
  await page.getByLabel('새 묶음 이름').fill('소설 A')
  await page.getByRole('button', { name: '만들기' }).click()
  // 새로 만든 묶음이 「지금 담는 묶음」이 된다 — 찾기의 + 가 여기로 들어간다
  await expect(page.locator('.chip.on')).toHaveText('소설 A')

  const row = page.locator('.review-row').filter({ hasText: '明白' })
  await row.locator('select').selectOption('소설 A')
  await expect(page.locator('.wl-group .section-title')).toHaveCount(2)

  await row.getByRole('button', { name: '메모' }).click()
  await page.getByLabel('明白 메모').fill('3장 첫 문단')
  await row.getByRole('button', { name: '저장' }).click()
  await expect(row.locator('.wl-memo')).toContainText('3장 첫 문단')

  // 다시 들어와도 남아 있다 — 새 star 이벤트로 쌓였다는 뜻이다
  await page.reload()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  const again = page.locator('.review-row').filter({ hasText: '明白' })
  await expect(again.locator('.wl-memo')).toContainText('3장 첫 문단', { timeout: 60_000 })
  await expect(page.locator('.wl-group .section-title')).toHaveCount(2)
})
