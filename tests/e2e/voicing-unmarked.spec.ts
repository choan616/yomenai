// 「청탁 미구분」이 이름·절·분포까지 이어지는지 (사용자 결정 2026-09-18, 2단계).
//
// 저장된 유형은 RENDAKU 하나뿐이다. 화면에 「청탁 미구분」이 뜨면 답으로 다시 매기는 길이
// 배지·규칙 화면·리포트 분포까지 이어진 것이다. 연탁이라고 부르던 자리였다.
import { expect, test, type Page } from '@playwright/test'

/** 愛好 あいこう 를 あいごう 로 — 好는 コウ 다. 규칙이 아니라 원형이 청음인 자리 */
const AIKOU = '1150680'

async function seed(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    (idiomId) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let i = 0; i < 2; i++) {
            store.put({
              id: `0000004${i}-vu`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType: 'RENDAKU',
              deletedAt: null,
              type: 'review',
              grade: 1,
              answer: 'あいごう',
              expected: 'あいこう',
              correct: false,
              elapsedMs: 1000,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    AIKOU,
  )
  await page.reload()
}

test('청탁 오답이 연탁이 아니라 청탁 미구분으로 불린다', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: '리포트', exact: true }).click()

  // 분포 — 저장은 RENDAKU 인데 갈래 이름으로 뜬다
  const bars = page.locator('.bars')
  await expect(bars).toBeVisible({ timeout: 20_000 })
  const row = bars.locator('.bar-row').filter({ hasText: '청탁 미구분' })
  await expect(row).toHaveCount(1)
  await expect(row.locator('.bar-num')).toHaveText('2')
  await expect(bars.locator('.bar-row').filter({ hasText: '연탁' })).toHaveCount(0)

  // 규칙 화면 — 그 절이 이 숙어를 기록으로 들고 있다
  await page.getByRole('button', { name: /읽기 규칙/ }).click()
  const section = page.locator('.rule-block').filter({ hasText: '탁음인지 아닌지는' })
  await expect(section).toHaveCount(1)
  await section.locator('.rule-head').click()
  const record = section.locator('.rule-open .rule-record')
  await expect(record).toContainText('청탁 미구분')
  await expect(record).toContainText('愛好')
})

test('다시보기 배지도 청탁 미구분을 가리킨다', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  const slide = page.locator('.browse-slide').filter({ hasText: '愛好' })
  await expect(slide).toHaveCount(1, { timeout: 20_000 })
  const badge = slide.locator('.card-head .rule-tag')
  await expect(badge).toContainText('청탁 미구분')

  // 눌러서 펼치면 연탁 절이 아니라 청탁 절이 나온다
  await badge.click()
  await expect(slide.locator('.browse-rule-title')).toContainText('탁음인지 아닌지는')
})
