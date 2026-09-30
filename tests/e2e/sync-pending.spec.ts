// 아직 안 올린 기록 — 설정의 「백업과 기록」 줄에 건수가 뜬다 (2026-10-01).
// PC 에서 묶음을 옮기고 동기화를 안 누른 채 모바일에서 받아 안 넘어온 일이 있었다(사용자 보고)
import { expect, test, type Page } from '@playwright/test'

async function seed(page: Page, deviceId: string, ats: number[]) {
  await page.evaluate(
    ([deviceId, ats]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          ats.forEach((at, i) =>
            store.put({
              id: `sp-${deviceId}-${i}`,
              userId: 'local',
              deviceId,
              at,
              idiomId: '1000220',
              cardType: 'reading',
              mistakeType: null,
              deletedAt: null,
              type: 'star',
              on: true,
              list: '소설',
            }),
          )
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    [deviceId, ats] as const,
  )
}

async function boot(page: Page, signedIn: boolean) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate((signedIn) => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
    localStorage.setItem('yomenai:deviceId', 'dev-me')
    localStorage.setItem('yomenai:sync:lastAt', String(Date.UTC(2026, 0, 10)))
    if (signedIn) localStorage.setItem('yomenai:sync:signedIn', '1')
  }, signedIn)
  // 마지막 동기화 전 1건 · 뒤 2건 · 다른 기기 1건 → 이 기기가 안 올린 것은 2건
  await seed(page, 'dev-me', [Date.UTC(2026, 0, 5), Date.UTC(2026, 0, 11), Date.UTC(2026, 0, 12)])
  await seed(page, 'dev-other', [Date.UTC(2026, 0, 13)])
  await page.reload()
  await page.getByRole('button', { name: '설정', exact: true }).click()
}

test('동기화를 연결했으면 마지막 동기화 뒤 이 기기 기록 수가 뜬다', async ({ page }) => {
  await boot(page, true)
  await expect(page.locator('.setting-link .sync-pending')).toHaveText('안 올린 기록 2건')
})

test('동기화를 연결한 적 없으면 안 뜬다', async ({ page }) => {
  await boot(page, false)
  await expect(page.getByRole('button', { name: /백업과 기록/ })).toBeVisible()
  await expect(page.locator('.sync-pending')).toHaveCount(0)
})
