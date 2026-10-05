// 이번 주 띠 — 홈의 결정 신호와 세션 요약의 채움 순간, 리포트 달력의 의미 층 (2026-09-30)
//
// 문구는 긍정형만 — 빠진 날에 대한 말은 어디에도 없다는 것도 여기서 못 박는다.
// 날짜 오프셋만 쓰고 월 경계는 안 따진다(report-attendance 와 같은 허용 오차). 단 월 경계를
// 타는 단언(달력 칸)은 이번 달 안의 날짜로만 한다.
import { expect, test, type Page } from '@playwright/test'
import { openDays } from './report-sheets.js'

async function seedDay(page: Page, daysAgo: number, count: number, wrong = 0) {
  await page.evaluate(
    ([daysAgo, count, wrong]) =>
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
              id: `wk-${daysAgo}-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: d.getTime() + i,
              idiomId: '1000220',
              cardType: 'reading',
              mistakeType: null,
              deletedAt: null,
              type: 'review',
              grade: i < wrong ? 1 : 3,
              answer: 'x',
              expected: 'x',
              correct: i >= wrong,
              elapsedMs: 1000,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [daysAgo, count, wrong] as const,
  )
}

async function boot(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
}

const today = '.week-strip:not(.slot) .week-cell[data-today]'

test('홈 — 오늘 아직이면 대기 칸 + 이어짐 문구, 과거 빈 날엔 아무 말도 없다', async ({ page }) => {
  await boot(page)
  await seedDay(page, 1, 3)
  await seedDay(page, 2, 3)
  await seedDay(page, 4, 20) // 사흘 전은 비었다 — 끊긴 기록이 있어도 부정 문구가 없어야 한다
  await page.reload()

  await expect(page.locator(today)).toHaveAttribute('data-state', 'pending')
  await expect(page.locator('.week-strip:not(.slot) .week-line')).toHaveText('3장이면 3일째로 이어져요')
  await expect(page.locator('.home')).not.toContainText(/끊|놓쳤|구멍|빠졌/)
})

test('홈 — 오늘 채웠으면 채운 칸 + 연속 일수', async ({ page }) => {
  await boot(page)
  await seedDay(page, 0, 20)
  await seedDay(page, 1, 3)
  await page.reload()

  await expect(page.locator(today)).toHaveAttribute('data-state', 'full')
  await expect(page.locator('.week-strip:not(.slot) .week-line')).toHaveText('2일째 이어가고 있어요')
})

// 오늘 조금 했지만 아직 문턱 아래인 날 (2026-10-02 — 그 전엔 2장을 한 사람에게도
// 「3장이면」이라고 해서 실제 남은 양과 어긋났다)
test('홈 — 오늘 몇 장 했으면 남은 장수를 말한다', async ({ page }) => {
  await boot(page)
  await seedDay(page, 0, 1)
  await page.reload()
  await expect(page.locator('.week-strip:not(.slot) .week-line')).toHaveText(
    '2장 더 하면 오늘 칸이 채워져요',
  )
  // 연속이 걸려 있으면 뒷말만 바뀐다
  await seedDay(page, 1, 3)
  await page.reload()
  await expect(page.locator('.week-strip:not(.slot) .week-line')).toHaveText(
    '2장 더 하면 2일째로 이어져요',
  )
})

test('홈 — 이정표 하루 전이면 이정표 이름으로 말한다', async ({ page }) => {
  await boot(page)
  for (let d = 1; d <= 6; d++) await seedDay(page, d, 3)
  await page.reload()
  await expect(page.locator('.week-strip:not(.slot) .week-line')).toHaveText('3장이면 1주 연속이에요')
})

test('요약 — 이번 세션이 오늘 칸을 채우면 그 칸이 차오른다', async ({ page }) => {
  await boot(page)
  await seedDay(page, 1, 3)
  await page.reload()
  // 짧은 세션 진입로는 리포트 달력의 오늘 칸이다 (2026-10-02) — 홈에서 「3장만」을 걷어냈다.
  // 어제까지 하루 이어졌으니 유도 문구가 그 이어짐으로 말한다
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await openDays(page)
  await page.locator('button.cal-cell[data-today]').click()
  await expect(page.locator('.cal-nudge')).toContainText('3장이면 2일째로 이어져요')
  await page.locator('.cal-nudge').getByRole('button', { name: /3장만/ }).click()
  await expect(page.locator('.study-bar .count')).toContainText('/ 3')
  for (let i = 0; i < 40; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    for (const name of ['다음', '봤어요', '알고 있었다', '뜻 보기', '알았어요']) {
      const btn = page.getByRole('button', { name, exact: true })
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {})
        break
      }
    }
    const qi = page.locator('.kana-input')
    if (await qi.isVisible().catch(() => false) && !(await page.locator('.card.feedback').isVisible())) {
      await qi.fill('tadashii')
      await qi.press('Enter')
    }
    await page.waitForTimeout(30)
  }
  await expect(page.getByText('세션 완료')).toBeVisible({ timeout: 15_000 })

  const cell = page.locator('.summary-screen .week-cell[data-today]')
  await expect(cell).toHaveAttribute('data-state', 'touched')
  await expect(cell).toHaveAttribute('data-fill', 'true')
  await expect(page.locator('.summary-screen .week-line')).toHaveText('2일째 이어가고 있어요')
})

test('리포트 — 연속 기록·달 요약·날짜 상세', async ({ page }) => {
  await boot(page)
  for (let d = 0; d <= 6; d++) await seedDay(page, d, 4, d === 0 ? 1 : 0)
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await openDays(page)
  await expect(page.locator('.cal-grid')).toBeVisible()

  await expect(page.locator('.cal-records')).toHaveText('지금 7일째 · 1주 연속 1번')
  await expect(page.locator('.cal-month-sum')).toContainText('장')

  // 오늘이 이정표 달성일 — 처음부터 펼쳐져 있다. 4장 중 1장 틀림 → 75%
  const todayCell = page.locator('.cal-cell[data-today]')
  await expect(todayCell).toHaveAttribute('data-milestone', 'true')
  await expect(page.locator('.cal-detail-head')).toContainText('4장 · 정답률 75%')
  await expect(page.locator('.cal-detail-tags')).toHaveText('1주 연속 달성')

  // 다시 누르면 접힌다
  await todayCell.click()
  await expect(page.locator('.cal-detail')).toHaveCount(0)
})

test('리포트 — 기록 없는 날은 누를 수 없다', async ({ page }) => {
  await boot(page)
  await seedDay(page, 0, 3)
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await openDays(page)
  await expect(page.locator('.cal-grid')).toBeVisible()
  // 누를 수 있는 칸은 기록이 있는 오늘 하나뿐이다
  await expect(page.locator('.cal-grid button.cal-cell')).toHaveCount(1)
})
