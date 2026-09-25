// 풀 정합 (2026-09-26) — 세션·음독맵·리포트가 **같은 풀**을 본다.
//
// 전에는 두 화면이 `base.json` 만 봐서, 담아 둔 밴드 4 를 공부해도 거기엔 안 잡혔다.
// 채점은 쌓이는데 분모에 없는 상태라 「공부는 했는데 화면엔 없는 것」이 됐다.
//
// 대상은 亜鈴(あれい, 밴드 4). 음독 쌍 `鈴:on:れい` 가 밴드 0~3 어디에도 안 나오므로,
// 분모가 정확히 1 늘면 그것은 **담은 밴드 4 가 풀에 들어왔다는 뜻**뿐이다.
import { expect, test, type Page } from '@playwright/test'

const DAY = 86_400_000

async function prime(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
      localStorage.setItem('yomenai:settings', JSON.stringify({ kunPercent: 0 }))
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '리포트' })).toBeVisible({ timeout: 20_000 })
}

/** 음독 맵을 열고 분모(쌍 수)를 읽는다 */
async function totalPairs(page: Page): Promise<number> {
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: /음독 맵/ }).click()
  const head = page.locator('.stat-big')
  await expect(head).toContainText('숙달', { timeout: 60_000 })
  const m = /한자 읽기\s+([\d,]+)쌍 중/.exec(await head.innerText())
  if (!m) throw new Error('총계를 못 읽었다')
  return Number(m[1]!.replace(/,/g, ''))
}

async function starAndStudy(page: Page): Promise<void> {
  await page.evaluate(
    (day) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const st = req.result.transaction('events', 'readwrite').objectStore('events')
          st.put({
            id: 'pa-1', userId: 'local', deviceId: 'e2e', at: Date.now() - 2 * day,
            idiomId: '1149960', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.put({
            id: 'pa-2', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1149960', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'review', grade: 3, answer: 'あれい', expected: 'あれい', correct: true,
            elapsedMs: 900,
          })
          st.transaction.oncomplete = () => res()
          st.transaction.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    DAY,
  )
  await page.reload()
}

test('담아서 공부한 밴드 4 의 음독 쌍이 음독맵 분모에 들어온다', async ({ page }) => {
  test.setTimeout(180_000)
  await prime(page)
  const before = await totalPairs(page)

  await starAndStudy(page)
  const after = await totalPairs(page)

  // 亜鈴 이 혼자 들고 오는 쌍은 `鈴:on:れい` 하나다
  expect(after).toBe(before + 1)
  await expect(page.locator('.rows')).toContainText('鈴')
})
