// 리포트의 요약 타일 → 하단 시트 열기·닫기 (2026-10-05). 상세(수준 표·달력·오답 분포·취약 음독)는 시트 안에 있다
import { expect, type Page } from '@playwright/test'

/** 타일 순서는 수준·학습한 날·많이 틀린 유형·취약 음독이다 (reportSummary.ts) */
async function openTile(page: Page, nth: number): Promise<void> {
  await page.locator('.summary .tile').nth(nth).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** 수준 시트 — 밴드 표·요약 막대 */
export const openLevel = (page: Page): Promise<void> => openTile(page, 0)
/** 학습한 날 시트 — 달력은 처음부터 열려 있다 */
export const openDays = (page: Page): Promise<void> => openTile(page, 1)
/** 오답 유형 시트 — 분포 막대 */
export const openMist = (page: Page): Promise<void> => openTile(page, 2)

/** 다시보기 시트 — 「더 보기」 줄로 연다. 무작위·유형별 다시보기 진입이 든다 */
export async function openBrowse(page: Page): Promise<void> {
  await page.locator('.tools').getByRole('button', { name: /^다시보기/ }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
}

/** 취약 음독 시트 — 요약 타일로 연다 */
export const openWeak = (page: Page): Promise<void> => openTile(page, 3)

export async function closeSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
}
