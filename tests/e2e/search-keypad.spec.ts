// 읽기로 찾기에도 앱 자판을 단다 (2026-09-19 사용자 요청). 세션 화면과 달리 결과 목록이
// 주인공이라 **입력창을 누른 뒤에만** 뜨고, 마지막 큰 키는 「확인」이 아니라 「닫기」다.
import { expect, test } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

test('찾기 자판은 누른 뒤에 뜨고 닫기로 접힌다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '찾기', exact: true }).click()

  const input = page.locator('.search-input')
  await expect(input).toBeVisible()
  await expect(input).toHaveAttribute('inputmode', 'none')

  // 누르기 전에는 자판이 없다 — 목록이 화면을 다 쓴다
  await expect(page.locator('.keypad')).toHaveCount(0)

  await input.click()
  const keypad = page.locator('.keypad')
  await expect(keypad).toBeVisible()

  // 로마자를 눌러 가나로 들어간다
  await keypad.getByRole('button', { name: 'k', exact: true }).click()
  await keypad.getByRole('button', { name: 'a', exact: true }).click()
  await expect(input).toHaveValue('か')

  // 지우기
  await keypad.getByRole('button', { name: '지우기', exact: true }).click()
  await expect(input).toHaveValue('')

  // 닫기로 접는다 (채점이 없는 화면이라 「확인」이 아니다)
  await keypad.getByRole('button', { name: 'k', exact: true }).click()
  await keypad.getByRole('button', { name: 'i', exact: true }).click()
  await expect(input).toHaveValue('き')
  await keypad.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.locator('.keypad')).toHaveCount(0)
  // 접혀도 찾은 값은 남는다
  await expect(input).toHaveValue('き')
})

test('찾기 자판은 화면 아래에 고정된다 — 목록을 스크롤해도 따라 내려가지 않는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  const input = page.locator('.search-input')
  await input.click()
  const keypad = page.locator('.keypad')
  await expect(keypad).toBeVisible()

  const vh = page.viewportSize()!.height
  const before = (await keypad.boundingBox())!
  // 픽셀 정확 비교는 전체 실행에서 한 번 흔들렸다 — 바닥에 붙었는지만 보면 되므로 1px 여유를 준다
  expect(Math.abs(before.y + before.height - vh)).toBeLessThanOrEqual(1)

  // 결과가 나오게 한 글자 치고 목록을 스크롤해도 자판은 그 자리다
  await keypad.getByRole('button', { name: 'k', exact: true }).click()
  await keypad.getByRole('button', { name: 'a', exact: true }).click()
  await page.locator('.screen').evaluate((el) => el.scrollBy(0, 400))
  const after = (await keypad.boundingBox())!
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
})
