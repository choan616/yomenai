// 키보드가 올라온 높이에서 한자가 잘리지 않는지 (2026-09-19 사용자 보고).
// iPhone 8 급 화면(375×667)에서 키보드·악세서리 바가 올라오면 가시 높이가 350px 안팎이 된다.
// 그 높이에서 ① 표제어 상자가 본문 안에 온전히 들어오고 ② 글리프가 줄 상자를 넘지 않아야 한다.
import { expect, test, type Page } from '@playwright/test'

const WIDTH = 375
const WITH_KEYBOARD = 350

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

test('키보드가 올라온 높이에서도 표제어가 안 잘린다', async ({ page }) => {
  await page.setViewportSize({ width: WIDTH, height: 667 })
  await page.goto('/')
  await reachReadingCard(page)

  await page.setViewportSize({ width: WIDTH, height: WITH_KEYBOARD })
  await page.waitForTimeout(300)

  const m = await page.evaluate(() => {
    const body = document.querySelector('.card-body') as HTMLElement
    const head = document.querySelector('.headword') as HTMLElement
    const b = body.getBoundingClientRect()
    const h = head.getBoundingClientRect()
    return {
      bodyTop: b.top,
      bodyBottom: b.bottom,
      headTop: h.top,
      headBottom: h.bottom,
      // 글리프 잉크는 줄 상자를 조금 넘는다(폰트 고유 높이가 line-height 보다 크다).
      // 넘친 만큼은 줄 상자 위아래로 반씩 삐져나가고, 조상의 overflow 가 거기서 자른다
      inkOverflow: head.scrollHeight - head.clientHeight,
      fontSize: getComputedStyle(head).fontSize,
      scrolled: body.scrollTop,
    }
  })

  // 실제로 잘리는지는 **잉크 상자**가 본문 안에 들어오는가로 본다
  const inkTop = m.headTop - m.inkOverflow / 2
  const inkBottom = m.headBottom + m.inkOverflow / 2
  expect(inkTop, `표제어 윗부분이 ${(m.bodyTop - inkTop).toFixed(1)}px 잘린다`).toBeGreaterThanOrEqual(m.bodyTop - 0.5)
  expect(inkBottom, `표제어 아랫부분이 ${(inkBottom - m.bodyBottom).toFixed(1)}px 잘린다`).toBeLessThanOrEqual(m.bodyBottom + 0.5)
  // 들어오자마자 스크롤돼 있으면 안 된다 — 사용자가 손대기 전에 이미 잘린 채로 보인다
  expect(m.scrolled).toBe(0)
  // 글자 크기는 안 줄인다 — 자형 학습에 해롭다는 원칙 (study.css 의 .card-body 주석)
  expect(parseFloat(m.fontSize)).toBeGreaterThanOrEqual(48)
})
