// 수준 판정의 새 상태 — 문턱 부근(오차 구간이 80% 를 걸친다)과 표본 부족 (2026-10-10 판정 기준 변경)
import { expect, test, type Page } from '@playwright/test'
import { gradings, putGradings, type Grading } from './level-seed.js'
import { openLevel } from './report-sheets.js'

async function open(page: Page, rows: Grading[]): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await putGradings(page, rows, 'near')
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.summary .tile')).toHaveCount(4, { timeout: 20_000 })
}

test('정답률이 문턱 근처면 안정도 흔들림도 아니라 「문턱 부근」이라고 말한다', async ({ page }) => {
  // 산책로 100개 중 80 정답 — 오차 구간 71~87% 가 문턱 80% 를 걸친다
  await open(page, gradings(0, 100, 80, 1))
  const tile = page.locator('.summary .tile').first()
  await expect(tile.locator('.tile-v')).toHaveText('산책로')
  await expect(tile.locator('.tile-s')).toHaveText('문턱 부근이에요')

  await openLevel(page)
  await expect(page.locator('.report-lead')).toHaveText('산책로 코스는 문턱 부근이에요')
  const row = page.locator('.ladder tbody tr').first()
  await expect(row).toHaveClass(/band-near/)
  await expect(row.locator('.sr-only')).toContainText('문턱 부근')
  await expect(row.locator('.rate')).toHaveText('80%')
  // 판정 기준을 밝힌다 — 7일 창, 최소 표본, 줄의 뜻
  const caption = page.locator('.ladder-caption')
  await expect(caption).toContainText('최근 7일 채점 기준')
  await expect(caption).toContainText('채점 100회·표현 60개 미만')
})

test('흔들리는 코스 아래의 문턱 부근 코스도 제목 줄이 말한다', async ({ page }) => {
  // 산책로 80/100(문턱 부근) · 뒷산 40/100(흔들림) — 제목이 뒷산만 말하면 산책로가 멀쩡해 보인다
  await open(page, [...gradings(0, 100, 80, 1), ...gradings(1, 100, 40, 1)])
  await openLevel(page)
  await expect(page.locator('.report-lead')).toHaveText('산책로 코스는 문턱 부근, 뒷산부터 흔들려요')
  // 한국어 안내문은 낱말 중간에서 끊기지 않는다
  await expect(page.locator('.trend-note')).toHaveCSS('word-break', 'keep-all')
})

test('표본이 모자라면 판정하지 않고 표본 부족으로 둔다 — 정답률이 높아도 안정이라 말하지 않는다', async ({ page }) => {
  // 99개 전부 정답이어도 100회에 못 미친다
  await open(page, gradings(0, 99, 99, 1))
  const tile = page.locator('.summary .tile').first()
  await expect(tile.locator('.tile-v')).toHaveText('—')
  await openLevel(page)
  const row = page.locator('.ladder tbody tr').first()
  await expect(row).toHaveClass(/band-thin/)
  await expect(row.locator('.sr-only')).toContainText('표본 부족')
})

test('같은 정답률도 표본이 충분하면 선명해진다 — 100회 전부 정답이면 안정이다', async ({ page }) => {
  await open(page, gradings(0, 100, 100, 1))
  const tile = page.locator('.summary .tile').first()
  await expect(tile.locator('.tile-v')).toHaveText('산책로')
  await expect(tile.locator('.tile-s')).toHaveText('안정이에요')
})
