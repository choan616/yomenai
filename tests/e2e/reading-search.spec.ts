// 읽기로 찾기 검증 — 로마자 입력이 가나로 바뀌고, 동음 묶음이 한국 한자음과 함께 뜬다 (2026-09-16).
// 보기만 하는 화면이라 채점 요소가 없어야 한다는 것도 같이 본다.
import { expect, test } from '@playwright/test'

test('히라가나로 한자 표기를 찾는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '읽기로 찾기' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '읽기로 찾기' }).click()

  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()

  // 찾기 전에는 범위를 먼저 알린다 — 검색창이 약속하는 것과 코퍼스가 다르다
  await expect(page.locator('.search-scope')).toContainText('한자 숙어')

  const input = page.getByLabel('읽기 검색')
  await input.fill('kouki')
  await expect(input).toHaveValue('こうき')

  // 묶음 머리 = 읽기 + 개수
  const group = page.locator('.hit-group').first()
  await expect(group.locator('.section-title')).toContainText('こうき')

  // 표기·한국 한자음·뜻이 한 줄에
  const kouki = group.locator('.rows > li').filter({ hasText: '光輝' })
  await expect(kouki).toContainText('광휘')
  await expect(kouki).toContainText('광채')

  // 한국 한자음까지 겹치는 줄(後期/후기 · 後記/후기)에 표식이 붙는다
  await expect(group.locator('.rows > li').filter({ hasText: '後期' }).locator('.kr-dup')).toBeVisible()
  await expect(kouki.locator('.kr-dup')).toHaveCount(0)

  // 앞부분 일치 — 다 치기 전에도 후보가 나온다
  await input.fill('こうしょう')
  await expect(page.locator('.hit-group .section-title').first()).toContainText('こうしょう')
  await expect(page.locator('.rows > li').filter({ hasText: '交渉' })).toContainText('교섭')

  // 채점하는 화면이 아니다
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '확인' })).toHaveCount(0)

  // 없는 읽기는 실패가 아니라 답이다
  await input.fill('arigatou')
  await expect(input).toHaveValue('ありがとう')
  await expect(page.locator('.empty')).toContainText('없어요')
  await expect(page.locator('.search-scope')).toBeVisible()

  await page.getByRole('button', { name: '홈으로', exact: true }).click()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible()
})
