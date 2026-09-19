// 앱이 직접 그리는 로마자 자판 (2026-09-19 사용자 요청). 터치 기기에서만 뜨고,
// 눌러 넣은 로마자가 wanakana 를 그대로 타서 가나로 바뀌어야 한다 — 값 대입으로는 안 된다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function reachReadingCard(page: Page): Promise<void> {
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()
  const input = page.locator('.kana-input')
  for (let i = 0; i < 200; i++) {
    if (await input.isVisible().catch(() => false)) break
    for (const name of ['알고 있었다', '봤어요']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) await b.click().catch(() => {})
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작' })
      if (await again.isVisible().catch(() => false)) await again.click()
    }
    await page.waitForTimeout(80)
  }
  await expect(input).toBeVisible({ timeout: 15_000 })
}

test('로마자 자판으로 쳐서 가나가 들어가고 채점까지 간다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)

  const keypad = page.locator('.keypad')
  await expect(keypad, '터치 기기에서는 자판이 떠야 한다').toBeVisible()
  // 시스템 키보드를 안 띄운다 — 자동 완성 후보도 악세서리 바도 여기서 끊긴다
  await expect(page.locator('.kana-input')).toHaveAttribute('inputmode', 'none')

  const input = page.locator('.kana-input')
  const key = (ch: string) => keypad.getByRole('button', { name: ch, exact: true })

  // wanakana 변환 — k + a 가 か 로 합쳐진다. 값 대입이었으면 'ka' 로 남는다
  await key('k').click()
  await key('a').click()
  await expect(input).toHaveValue('か')

  // 지우기
  await keypad.getByRole('button', { name: '지우기' }).click()
  await expect(input).toHaveValue('')
  await key('k').click()
  await key('a').click()

  // 촉음 — 자음을 겹치면 っ 가 된다 (로마자 입력의 기본)
  for (const ch of ['t', 't', 'a']) await key(ch).click()
  await expect(input).toHaveValue('かった')

  // 확인 키로 채점까지 간다
  await keypad.getByRole('button', { name: '확인' }).click()
  await expect(page.locator('.card.feedback')).toBeVisible()
})

test('누른 글자를 키 위로 확대해 보여준다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)
  const keypad = page.locator('.keypad')
  const s = keypad.getByRole('button', { name: 's', exact: true })

  // 누르기 전에는 없다
  await expect(page.locator('.key-pop')).toHaveCount(0)

  // 손가락을 얹은 동안만 뜬다
  await s.dispatchEvent('pointerdown')
  await expect(page.locator('.key-pop')).toHaveText('s')
  await s.dispatchEvent('pointerup')
  await expect(page.locator('.key-pop')).toHaveCount(0)
})

test('장음 키는 없다 — 밴드 0~3 읽기에 ー 가 한 건도 없다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)
  await expect(page.locator('.keypad').getByRole('button', { name: 'ー', exact: true })).toHaveCount(0)
})
