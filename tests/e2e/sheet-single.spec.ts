// 시트는 한 번에 하나 (2026-10-06 사용자 신고 「하단 메뉴가 겹쳐서 나온다」).
//
// 설정은 탭이면서 시트다. 탭을 옮겨도 밑에 깔린 탭은 그대로 살아 있어(App 의 `underTab`)
// 제 시트를 들고 있었고, 리포트의 시트가 열린 채 설정을 누르면 둘이 같은 자리에 겹쳤다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function seed(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 40).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        ids.forEach((idiomId, i) => {
          store.put({
            id: `00000${String(i).padStart(3, '0')}-seed`,
            userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'SOKUON', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        tx.oncomplete = () => done()
      }
    })
  })
  await page.reload()
}

test('리포트 시트가 열린 채 설정을 열면 설정 하나만 선다', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.locator('.tools').getByRole('button', { name: /^다시보기/ }).click()
  await expect(page.getByRole('dialog', { name: '다시보기' })).toBeVisible()

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '설정' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)

  // 설정을 닫으면 리포트로 돌아오고, 닫혔던 시트가 되살아나지 않는다
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.report')).toBeVisible()
})

test('다시보기에 들어갔다 나와도 시트는 닫힌 채다', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.locator('.tools').getByRole('button', { name: /^다시보기/ }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  await expect(page.locator('.browse-slide').first()).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '다시보기 나가기' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
})
