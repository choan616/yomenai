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

  // 자판은 세션 안에 있어도 정보용 서체다 (2026-10-02 사용자 지적 「커스텀 자판은 원래가 더 좋은 것 같다」).
  // 세션은 표시용(Jua)인데 자판만 되돌아와야 한다 — 위의 카드 꼬리표와 비교해 둘이 다름을 본다
  const family = (loc: ReturnType<Page['locator']>) =>
    loc.evaluate((el) => getComputedStyle(el).fontFamily.split(',')[0]!.replace(/["']/g, ''))
  expect(await family(key('k'))).toBe('Prd Sans KO')
  expect(await family(keypad.getByRole('button', { name: '지우기' }))).toBe('Prd Sans KO')
  expect(await family(page.locator('.study-bar .count'))).toBe('Jua')

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

// 보조 기술(스위치 제어·TalkBack 등)은 pointerdown 없이 click 만 보낼 수 있다 (2026-09-30)
test('click 만 와도 키가 눌리고 확인이 채점까지 간다', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)
  const keypad = page.locator('.keypad')
  const input = page.locator('.kana-input')
  const key = (ch: string) => keypad.getByRole('button', { name: ch, exact: true })

  for (const ch of ['k', 'a', 'k']) await key(ch).dispatchEvent('click')
  await expect(input).toHaveValue('かk')
  await keypad.getByRole('button', { name: '지우기' }).dispatchEvent('click')
  await expect(input).toHaveValue('か')

  await keypad.getByRole('button', { name: '확인' }).dispatchEvent('click')
  await expect(page.locator('.card.feedback')).toBeVisible()
})

test('손가락 누름은 click 이 뒤따라도 한 번만 들어간다 — 같은 키 연타(tt)도', async ({ page }) => {
  await page.goto('/')
  await reachReadingCard(page)
  const keypad = page.locator('.keypad')
  const key = (ch: string) => keypad.getByRole('button', { name: ch, exact: true })

  // tap 은 터치 pointerdown → pointerup → click 을 다 낸다
  for (const ch of ['k', 'a', 't', 't', 'a']) await key(ch).tap()
  await expect(page.locator('.kana-input')).toHaveValue('かった')
})

test('설정에서 「기기 키보드」를 고르면 세션에 앱 자판이 안 뜨고 시스템 키보드가 열린다', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.getByRole('button', { name: '설정', exact: true }).click()
  const system = page.getByRole('group', { name: '키보드', exact: true }).getByRole('button', {
    name: '기기 키보드',
  })
  await system.click()
  await expect(system).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('yomenai:settings')!).keyboard)).toBe(
    'system',
  )

  await page.getByRole('button', { name: '홈', exact: true }).click()
  await reachReadingCard(page)
  await expect(page.locator('.keypad')).toHaveCount(0)
  // PC 와 같은 경로 — ASCII 키보드라 IME 후보 바는 안 뜨고, 받아쓰기 버튼이 있는 시스템 키보드다
  await expect(page.locator('.kana-input')).toHaveAttribute('inputmode', 'url')
  // 자판의 확인 키 대신 입력 옆 확인 버튼이 돌아온다
  await expect(page.locator('.answer-row .btn-primary', { hasText: '확인' })).toBeVisible()
})
