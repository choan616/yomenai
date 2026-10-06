// 세션 요약의 「読」 배지와 도넛 — 맞은 몫·틀린 몫이 이어진 호, 일본어 글자에 lang 이 붙는다 (2026-10-05 디자인 시안)
import { expect, test } from '@playwright/test'
import { openDays } from './report-sheets.js'

test('요약 — 도넛이 그려지고 「読」 배지가 일본어로 표시된다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  // 어제 3장을 심어 둔다 — 리포트 달력이 보이려면 기록이 있어야 한다
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const d = new Date()
          d.setDate(d.getDate() - 1)
          d.setHours(12, 0, 0, 0)
          for (let i = 0; i < 3; i++) {
            tx.objectStore('events').put({
              id: `sb-${i}`,
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
  )
  await page.reload()
  // 짧은 세션 진입로는 리포트 달력의 오늘 칸이다 (2026-10-02)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await openDays(page)
  await page.locator('button.cal-cell[data-today]').click()
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

  await expect(page.locator('.summary-badge')).toBeVisible()
  // 맞은 호는 있고(오늘 세션의 일부는 맞는다), 호는 끊어진 눈금이 아니라 원 하나에 얹힌 이어진 선이다
  await expect(page.locator('.summary-donut .donut-track')).toHaveCount(1)
  expect(await page.locator('.summary-donut .donut-arc').count()).toBeGreaterThan(0)
  await expect(page.locator('.summary-tick')).toHaveCount(0)
  // 카드 수(3)만큼 호와 구분선이 선다 — 푼 순서대로 하나씩(연달아 맞은 것도 장수가 읽힌다)
  await expect(page.locator('.summary-donut .donut-arc')).toHaveCount(3)
  await expect(page.locator('.summary-donut .donut-sep')).toHaveCount(3)
  // 정답 호 수·오답 호 수가 위 숫자(맞은 수 / 전체)와 같고, 가운데 배지는 많은 쪽 색이다
  const nums = (await page.locator('.summary-num').innerText()).match(/\d+/g)!.map(Number)
  const [right, all] = [nums[0]!, nums[1]!]
  await expect(page.locator('.summary-donut .donut-arc:not(.miss)')).toHaveCount(right)
  await expect(page.locator('.summary-donut .donut-arc.miss')).toHaveCount(all - right)
  await expect(page.locator('.summary-seal')).toHaveClass(all - right > right ? /miss/ : /ok/)
  const seal = page.locator('.summary-seal')
  await expect(seal).toHaveText('読')
  await expect(seal).toHaveAttribute('lang', 'ja')
  // 배지는 장식이라 낭독에서 숨기고, 같은 말을 숫자가 글자로 한다
  await expect(page.locator('.summary-badge')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.locator('.summary-num')).toBeVisible()
})
