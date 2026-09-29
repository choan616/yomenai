// 매일 학습 달력 — 하루 채점 수에 따라 none(구멍)/touched/full로 갈린다 (2026-09-29, 사용자 제안).
//
// 포인트·배지·스트릭은 기각했지만(2026-09-06/07 절) 빈 칸이 "쉰 날"로 보이는 것 자체는
// 남긴다. 대신 "3장만"(QUICK_SESSION_LIMIT)만 채워도 구멍이 안 생기고, 기준 세션
// (sessionLimit)을 넘긴 날은 `full`로 갈라 다르게 보여준다는 것을 실제 DOM에서 못 박는다.
import { expect, test, type Page } from '@playwright/test'

/** `daysAgo`일 전 로컬 정오에 채점 `count`개를 심는다. 자정 근처 실행에서도 날짜가
 *  안 흔들리게 정오로 고정한다 */
async function seedDay(page: Page, daysAgo: number, count: number) {
  await page.evaluate(
    ([daysAgo, count]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          const d = new Date()
          d.setDate(d.getDate() - daysAgo)
          d.setHours(12, 0, 0, 0)
          for (let i = 0; i < count; i++) {
            store.put({
              id: `att-${daysAgo}-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: d.getTime(),
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
    [daysAgo, count] as const,
  )
}

/** 테스트가 쓴 것과 같은 로컬 날짜 키(YYYY-MM-DD)를 브라우저에서 구해온다 —
 *  Node·브라우저 두 곳에서 따로 계산하면 자정 근처에서 하루가 어긋날 수 있다 */
async function dateKeyForDaysAgo(page: Page, daysAgo: number): Promise<string> {
  return page.evaluate((n) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, daysAgo)
}

test('매일 학습 달력 — 문턱에 따라 none/touched/full로 갈린다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })

  // 오늘 — 기본 sessionLimit(20) 그대로 채워 full. 어제 — "3장만"만 채워 touched.
  // 그제 — 문턱(3) 미만이라 여전히 구멍(none)
  await seedDay(page, 0, 20)
  await seedDay(page, 1, 3)
  await seedDay(page, 2, 1)

  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await expect(page.locator('.attendance-grid')).toBeVisible()
  await expect(page.locator('.attendance-cell')).toHaveCount(28)

  const today = await dateKeyForDaysAgo(page, 0)
  const yesterday = await dateKeyForDaysAgo(page, 1)
  const dayBefore = await dateKeyForDaysAgo(page, 2)

  await expect(page.locator(`.attendance-cell[title="${today}"]`)).toHaveAttribute(
    'data-state',
    'full',
  )
  await expect(page.locator(`.attendance-cell[title="${yesterday}"]`)).toHaveAttribute(
    'data-state',
    'touched',
  )
  await expect(page.locator(`.attendance-cell[title="${dayBefore}"]`)).toHaveAttribute(
    'data-state',
    'none',
  )
})
