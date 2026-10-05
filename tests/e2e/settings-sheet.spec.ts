// 설정 하단 시트 — 올라오고, 끌면 늘어나고, 여러 길로 닫히며, 행동 항목이 세밀한 설정보다 먼저 나온다 (2026-10-04)
import { expect, test, type Page } from '@playwright/test'

async function open(page: Page): Promise<void> {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '설정', exact: true }).click()
  // 올라오는 애니메이션이 끝난 뒤에야 핸들 위치가 확정이다 — 움직이는 중에 재면 끌기가 엉뚱한 곳(배경)을 눌러 시트가 닫힌다
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))))
}

const sheet = (page: Page) => page.getByRole('dialog', { name: '설정' })
const heightOf = async (page: Page) => (await sheet(page).boundingBox())!.height

/** 핸들 한가운데에서 `dy` 만큼(위가 음수) 끈다 */
async function dragHandle(page: Page, dy: number, steps = 12): Promise<void> {
  const box = (await page.locator('.sheet-top').boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + 14
  await page.mouse.move(x, y)
  await page.mouse.down()
  // 속도를 낮게 유지한다 — 튕기기(빠른 속도)가 아니라 위치로 판정되게
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(x, y + (dy * i) / steps)
    await page.waitForTimeout(40)
  }
  await page.waitForTimeout(250) // 놓기 직전에 멈춰 속도를 0 으로
  await page.mouse.up()
}

test('설정 탭은 하단 시트로 올라오고 탭바는 그대로 남는다', async ({ page }) => {
  await open(page)
  await expect(sheet(page)).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  // 시트는 탭바 위에 있다 — 겹치지 않는다. 올라오는 애니메이션이 끝나면 아래 끝이 탭바 윗선에 붙는다
  const t = (await page.getByRole('navigation', { name: '주 메뉴' }).boundingBox())!
  await expect
    .poll(async () => {
      const b = (await sheet(page).boundingBox())!
      return Math.round(b.y + b.height)
    })
    .toBeLessThanOrEqual(Math.round(t.y) + 1)
  const s = (await sheet(page).boundingBox())!
  // 처음 높이는 화면 절반쯤이다 — 전체가 아니다
  expect(s.height).toBeLessThan(844 * 0.6)
  expect(s.height).toBeGreaterThan(300)
})

test('처음 높이에는 행동 항목이 먼저, 세밀한 설정은 그 아래에 있다', async ({ page }) => {
  await open(page)
  const backup = await page.getByRole('button', { name: /백업과 기록/ }).boundingBox()
  const learn = await page.getByRole('heading', { name: '학습' }).boundingBox()
  expect(backup!.y).toBeLessThan(learn!.y)
  // 처음 높이 안에 백업과 기록이 들어 있다
  const s = (await sheet(page).boundingBox())!
  expect(backup!.y + backup!.height).toBeLessThanOrEqual(s.y + s.height)
})

test('핸들을 누르면 펼쳐지고 다시 누르면 줄어든다', async ({ page }) => {
  await open(page)
  const peek = await heightOf(page)
  await page.getByRole('button', { name: '설정 펼치기' }).click()
  await expect(page.getByRole('button', { name: '설정 줄이기' })).toHaveAttribute('aria-expanded', 'true')
  await expect.poll(() => heightOf(page)).toBeGreaterThan(peek + 150)
  await page.getByRole('button', { name: '설정 줄이기' }).click()
  await expect.poll(() => heightOf(page)).toBeLessThan(peek + 5)
})

test('위로 끌면 전체 높이로, 아래로 많이 끌면 닫힌다', async ({ page }) => {
  await open(page)
  const peek = await heightOf(page)
  await dragHandle(page, -300)
  await expect(page.getByRole('button', { name: '설정 줄이기' })).toBeVisible()
  await expect.poll(() => heightOf(page)).toBeGreaterThan(peek + 150)

  // 전체에서 중간쯤 내리면 처음 높이로
  await dragHandle(page, 260)
  await expect(page.getByRole('button', { name: '설정 펼치기' })).toBeVisible()
  await expect.poll(() => heightOf(page)).toBeLessThan(peek + 5)

  // 처음 높이에서 크게 내리면 닫힌다 — 설정 탭 전의 탭(홈)으로 돌아간다
  await dragHandle(page, 330)
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '홈', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('바깥을 누르거나 Esc 를 누르거나 설정 탭을 또 누르면 닫힌다', async ({ page }) => {
  await open(page)
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 40 } })
  await expect(sheet(page)).toHaveCount(0)

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(sheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(sheet(page)).toBeVisible()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(sheet(page)).toHaveCount(0)
})

test('다른 탭을 누르면 시트가 닫히고 그 탭이 열린다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: '리포트', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('백업과 기록으로 들어갔다 돌아오면 시트가 다시 뜬다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: /백업과 기록/ }).click()
  await expect(sheet(page)).toHaveCount(0)
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(sheet(page)).toBeVisible()
})

test('값 컨트롤도 시트 안에서 그대로 쓸 수 있다 (처음 높이 밖은 스크롤)', async ({ page }) => {
  await open(page)
  const theme = page.getByRole('group', { name: '테마' }).getByRole('button', { name: '라이트' })
  await theme.click()
  await expect(theme).toHaveAttribute('aria-pressed', 'true')
})
