// 리포트 표의 밴드 4 줄 — 숙지 칸이 「범위 밖」이 아니라 값을 낸다 (2026-10-01 사용자 판단).
//
// 사전 밖·밴드 4 표현까지 뜻을 검수하게 되면서 그 줄도 볼 값이 생겼다. 다만 **총계·그래프·경계 판정에는
// 안 넣는다** — 2026-09-26 판단 그대로다. 그래서 숫자는 흐리게(`dim`) 두고 설명이 말한다.
import { expect, test } from '@playwright/test'
import { openLevel } from './report-sheets.js'

test('밴드 4 줄은 숙지 값을 흐리게 내고, 총계에는 안 들어간다', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.goto('/')
  // 苛烈(1195220) — 밴드 4 를 담아 한 번 맞혔다
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const st = req.result.transaction('events', 'readwrite').objectStore('events')
          st.put({
            id: 'b4-star', userId: 'local', deviceId: 'e2e', at: Date.now() - 2 * 86_400_000,
            idiomId: '1195220', on: true, deletedAt: null, type: 'star',
          })
          st.put({
            id: 'b4-rev', userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000,
            idiomId: '1195220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'review', grade: 3, answer: 'かれつ', expected: 'かれつ', correct: true, elapsedMs: 900,
          })
          st.transaction.oncomplete = () => res()
          st.transaction.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
  )
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await openLevel(page)

  const row = page.locator('.ladder tbody tr').filter({ hasText: '밴드 4' })
  await expect(row).toBeVisible({ timeout: 60_000 })
  // 열 순서는 출제 · 숙지 · 최근 정답률
  const mastered = row.locator('td').nth(1)
  await expect(mastered).not.toHaveText('범위 밖')
  await expect(mastered).toHaveText(/^\d+$/)
  await expect(mastered).toHaveClass(/dim/)

  // 합계에는 안 들어간다 — 밴드 4 만 푼 사람의 「숙지한 표현」은 0개다
  await expect(page.locator('.ladder-total')).toHaveText('0개')
  await expect(page.locator('.ladder-caption')).toContainText('표에만 나오고')
})
