// 매일 학습 달력 — 하루 채점 수에 따라 none(쉰 날)/touched/full로 갈린다 (2026-09-29, 사용자 제안).
//
// 포인트·배지·스트릭은 기각했지만(2026-09-06/07 절) 빈 칸이 "쉰 날"로 보이는 것 자체는
// 남긴다. 대신 "3장만"(QUICK_SESSION_LIMIT)만 채워도 구멍이 안 생기고, 기준 세션
// (sessionLimit)을 넘긴 날은 `full`로 갈라 다르게 보여준다는 것을 실제 DOM에서 못 박는다.
// 달력은 이번 달을 기본으로 보여준다. 그래서 오늘·어제·그저께가 한 달 안에 들어야 세 칸이 다 보이는데,
// 실제 날짜로 돌리면 **매달 1일·2일에 그저께·어제가 지난달이라 칸을 못 찾아 실패했다**
// (2026-10-01·02 에 실제로 걸렸다). 그래서 브라우저 시계를 월중 날짜로 **고정**한다 — 언제 돌려도 같다.
// 다른 e2e(report-stable-mix)도 날짜 상대 오프셋을 쓰지만 이 테스트처럼 칸 하나하나를 짚지는 않는다.
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
  // 시계를 월중(9월 15일 정오)으로 고정한다. 타이머는 그대로 흐르고 `Date` 만 고정이다.
  // 새로고침해도 유지된다 — 아래에서 reload 한 뒤에도 같은 날짜로 칸을 짚는다
  await page.clock.setFixedTime(new Date(2026, 8, 15, 12, 0, 0))
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
  await page.getByRole('button', { name: '달력', exact: true }).click()
  await expect(page.locator('.cal-grid')).toBeVisible()

  const today = await dateKeyForDaysAgo(page, 0)
  const yesterday = await dateKeyForDaysAgo(page, 1)
  const dayBefore = await dateKeyForDaysAgo(page, 2)

  await expect(page.locator(`.cal-cell[title="${today}"]`)).toHaveAttribute('data-tier', 'full')
  await expect(page.locator(`.cal-cell[title="${today}"]`)).toHaveAttribute('data-today', 'true')
  await expect(page.locator(`.cal-cell[title="${yesterday}"]`)).toHaveAttribute(
    'data-tier',
    'touched',
  )
  await expect(page.locator(`.cal-cell[title="${dayBefore}"]`)).toHaveAttribute('data-tier', 'none')
})

test('이전 달로 넘어가면 그 달 기록을, 다음 달 버튼은 이번 달에서 막힌다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seedDay(page, 0, 20)

  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: '달력', exact: true }).click()
  await expect(page.locator('.cal-grid')).toBeVisible()

  // 이번 달에서는 다음 달로 못 간다 — 텅 빈 미래 달을 보여줄 이유가 없다
  await expect(page.getByRole('button', { name: '다음 달' })).toBeDisabled()

  const beforeTitle = await page.locator('.cal-title').textContent()
  await page.getByRole('button', { name: '이전 달' }).click()
  await expect(page.locator('.cal-title')).not.toHaveText(beforeTitle ?? '')
  // 이전 달로 가면 다음 달 버튼이 다시 열린다
  await expect(page.getByRole('button', { name: '다음 달' })).toBeEnabled()

  await page.getByRole('button', { name: '다음 달' }).click()
  await expect(page.locator('.cal-title')).toHaveText(beforeTitle ?? '')
})

// 오늘 칸 유도 (2026-10-02 사용자 지시) — 홈에서 걷어낸 「3장만」이 이 자리로 옮겨왔다.
// 아직 지나지 않은 날에만, 그 칸을 누른 사람에게만 나온다. 소급해 채울 수 없는 지난 빈 날은
// 누를 수도 없다(네거티브 표시 금지의 연장 — 할 말이 없는 날엔 아무 말도 안 한다)
test('오늘 칸이 비어 있으면 눌러 짧은 세션으로 가고, 지난 빈 날은 눌리지 않는다', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 15, 12, 0, 0))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  // 어제만 채운다 — 오늘과 그제는 비어 있다
  await seedDay(page, 1, 3)
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: '달력', exact: true }).click()
  await expect(page.locator('.cal-grid')).toBeVisible()

  const dayBefore = await dateKeyForDaysAgo(page, 2)
  await expect(page.locator(`button.cal-cell[title="${dayBefore}"]`)).toHaveCount(0)
  // 누르기 전에는 유도가 없다 — 달력을 열었을 뿐인 사람에게 들이대지 않는다
  await expect(page.locator('.cal-nudge')).toHaveCount(0)

  await page.locator('button.cal-cell[data-today]').click()
  await expect(page.locator('.cal-nudge')).toContainText('3장이면 2일째로 이어져요')
  await page.locator('.cal-nudge').getByRole('button', { name: /3장만/ }).click()
  await expect(page.locator('.study-bar .count')).toContainText('/ 3', { timeout: 30_000 })
})

test('오늘 칸을 이미 채운 날에는 유도가 없다', async ({ page }) => {
  await page.clock.setFixedTime(new Date(2026, 8, 15, 12, 0, 0))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seedDay(page, 0, 3)
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: '달력', exact: true }).click()
  // 오늘 기록이 있으면 달력이 처음부터 그 날을 펼친다 — 누르지 않아도 상세가 떠 있다
  await expect(page.locator('.cal-detail')).toBeVisible()
  await expect(page.locator('.cal-nudge')).toHaveCount(0)
})

/** 지금까지 쌓인 채점(`type: 'review'`) 수 — 소개 카드는 안 센다(그건 `meaningKnown` 이다) */
async function reviewCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const all = req.result.transaction('events', 'readonly').objectStore('events').getAll()
          all.onsuccess = () =>
            res((all.result as { type: string }[]).filter((e) => e.type === 'review').length)
          all.onerror = () => rej(new Error('읽기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
  )
}

// 세션을 끝까지 안 해도 그 날은 채워지나 (2026-10-02 사용자 질문).
// 답은 **채워진다** — 읽기 답은 「다음」을 누를 때, 뜻 답은 고를 때 그 자리에서 `appendEvent` 한다.
// 달력은 세션 완주가 아니라 채점 수를 세므로(`buildAttendance`) 3장만 넘기고 나가도 문턱을 넘는다.
// 홈 띠가 「3장이면 오늘 칸이 채워져요」라고 말할 수 있는 근거라 여기서 못 박는다 — 20장 세션에서
// 3장만 해도 된다는 뜻이고, 그 3장은 완주와 무관하다.
test('세션을 중간에 나가도 넘긴 카드는 남아 오늘 칸이 채워진다', async ({ page }) => {
  test.setTimeout(120_000)
  await page.clock.setFixedTime(new Date(2026, 8, 15, 12, 0, 0))
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.reload()
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 20_000 })

  // 채점 3개(문턱)만 만들고 **완주하지 않고** 나간다
  for (let i = 0; i < 80 && (await reviewCount(page)) < 3; i++) {
    for (const name of ['다음', '봤어요', '알고 있었다', '뜻 보기', '알았어요']) {
      const btn = page.getByRole('button', { name, exact: true })
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {})
        break
      }
    }
    const input = page.locator('.kana-input')
    if (
      (await input.isVisible().catch(() => false)) &&
      !(await page.locator('.card.feedback').isVisible())
    ) {
      await input.fill('tadashii')
      await input.press('Enter')
    }
    await page.waitForTimeout(30)
  }
  expect(await reviewCount(page)).toBeGreaterThanOrEqual(3)
  await expect(page.getByText('세션 완료')).toHaveCount(0)

  await page.getByRole('button', { name: '세션 나가기' }).click()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: '달력', exact: true }).click()
  await expect(page.locator('.cal-cell[data-today]')).toHaveAttribute('data-tier', 'touched')
})
