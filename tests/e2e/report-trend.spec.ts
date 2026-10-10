// 수준 시트의 정답률 추이 — 선 하나, 칩으로 전체·코스별 (2026-10-09 사용자 지시)
import { expect, test, type Page } from '@playwright/test'
import { gradings, putGradings } from './level-seed.js'
import { openLevel } from './report-sheets.js'

const DAY = 86_400_000

/** 밴드 0 · 음독 하나 (표본이 모자란 둘째 시험에서 쓴다) */
const B0 = '1000220'

type Row = { idiomId: string; daysAgo: number; correct: boolean[] }

async function seed(page: Page, rows: Row[]) {
  await page.evaluate(
    ([rows, day]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          rows.forEach((r, ri) => {
            r.correct.forEach((ok, i) => {
              store.put({
                id: `trend-${ri}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                // 같은 날 안에서는 순서를 i 로 정한다
                at: Date.now() - r.daysAgo * day + i,
                idiomId: r.idiomId,
                cardType: 'reading',
                mistakeType: null,
                deletedAt: null,
                type: 'review',
                grade: ok ? 3 : 1,
                answer: 'x',
                expected: 'x',
                correct: ok,
                elapsedMs: 1000,
              })
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [rows, DAY] as const,
  )
}

const t = (n: number, v: boolean) => Array.from({ length: n }, () => v)

test('칩으로 전체와 코스별 선을 고르고, 점을 눌러 날짜별 값을 읽는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  // 판정 창은 마지막 채점일 기준 7일, 모자라면 최근 100회다 (2026-10-10).
  // 10일 전: 산책로 40개 전부 정답 → 전체 40/40
  //  5일 전: 산책로 40개 중 32 정답 → 7일 창이 80회라 100회에 못 미쳐 전부 → 전체 72/80 (90%), 산책로 72/80
  //  3일 전: 뒷산 40개 중 20 정답 → 창이 80회라 최근 100회까지 넓힌다(10일 전 20개 포함) → 전체 72/100, 뒷산 20/40 (50%)
  await putGradings(page, gradings(0, 40, 40, 10), 'tr10')
  await putGradings(page, gradings(0, 40, 32, 5), 'tr5')
  await putGradings(page, gradings(1, 40, 20, 3), 'tr3')
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await openLevel(page)

  const trend = page.locator('.trend')
  await expect(trend).toBeVisible()
  const chips = trend.locator('.trend-chips .chip')
  // 기본은 전체. 점이 없는 코스(중턱·능선)는 고를 수 없다
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.first()).toHaveText('전체')
  await expect(trend.getByRole('button', { name: '중턱' })).toBeDisabled()
  await expect(trend.getByRole('button', { name: '능선' })).toBeDisabled()

  // 값이 먼저, 날짜가 뒤 — 마지막 점이 기본이다
  const readout = trend.locator('.trend-readout')
  await expect(readout).toContainText('72%')
  await expect(readout).toContainText('최근 100회')
  await expect(trend.locator('.trend-line')).toHaveCount(1)

  // 그림 왼쪽 끝을 누르면 가장 이른 날로 붙는다
  await trend.locator('.trend-hit').click({ position: { x: 2, y: 20 } })
  await expect(readout).toContainText('100%')
  await expect(readout).toContainText('최근 40회')

  // 코스별 — 마지막 점이 수준 표의 그 코스 값과 같다
  await trend.getByRole('button', { name: '산책로' }).click()
  await expect(readout).toContainText('90%')
  await expect(page.locator('.ladder tbody tr').first().locator('.rate')).toHaveText('90%')
  await trend.getByRole('button', { name: '뒷산' }).click()
  await expect(readout).toContainText('50%')
  await expect(trend.getByRole('button', { name: '뒷산' })).toHaveAttribute('aria-pressed', 'true')
  await expect(trend.locator('.trend-line')).toHaveCount(0) // 점이 하나뿐이면 선 없이 점만

  // 코스 선의 색은 그 코스의 밴드 색이다
  await trend.getByRole('button', { name: '산책로' }).click()
  const [stroke, band0] = await page.evaluate(() => [
    getComputedStyle(document.querySelector('.trend-line')!).stroke,
    (() => {
      const probe = document.createElement('i')
      probe.style.color = 'var(--band-0)'
      document.body.append(probe)
      const c = getComputedStyle(probe).color
      probe.remove()
      return c
    })(),
  ])
  expect(stroke).toBe(band0)

  // 표로 보기 — 선과 같은 값이 글자로 있다
  await trend.getByRole('button', { name: '전체' }).click()
  await trend.locator('.trend-table summary').click()
  await expect(trend.locator('.trend-table tbody tr')).toHaveCount(3)
  await expect(trend.locator('.trend-table tbody tr').last()).toContainText('72%')
})

test('추이가 없으면 안내만 낸다 — 칩은 모두 잠긴다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seed(page, [{ idiomId: B0, daysAgo: 2, correct: t(3, true) }]) // 표본 5회 미만
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await openLevel(page)
  const trend = page.locator('.trend')
  await expect(trend.locator('.trend-empty')).toBeVisible()
  await expect(trend.locator('.trend-svg')).toHaveCount(0)
  await expect(trend.locator('.chip:enabled')).toHaveCount(0)
})
