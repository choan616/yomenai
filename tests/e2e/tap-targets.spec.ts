// 작은 버튼의 눌리는 영역이 모양보다 넓어 44px 이상인지, 좁은 화면에서 찾기 안내 문구가 잘리지 않는지 (2026-11-01 디자인 검토)
import { expect, test, type Locator, type Page } from '@playwright/test'

async function open(page: Page, width = 375): Promise<void> {
  await page.setViewportSize({ width, height: 667 })
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
}

/** 가운데에서 위·아래 21px 떨어진 점이 이 버튼(또는 안쪽)에 닿는가 — 눌리는 높이가 42px 이상이라는 뜻이다 */
async function pressableHeight(loc: Locator): Promise<boolean> {
  return loc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const x = r.left + r.width / 2
    const y = r.top + r.height / 2
    return [y - 21, y + 21].every((py) => {
      const hit = document.elementFromPoint(x, py)
      return hit !== null && (hit === el || el.contains(hit))
    })
  })
}

test('설정의 돌아가기는 모양 밖까지 눌린다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: /백업과 기록/ }).click()
  expect(await pressableHeight(page.getByRole('button', { name: '돌아가기' }))).toBe(true)
})

test('세션의 나가기 ✕ 는 모양 밖까지 눌린다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '세션 시작' }).click()
  const exit = page.getByRole('button', { name: '세션 나가기' })
  await expect(exit).toBeVisible({ timeout: 10_000 })
  // 챕터 타이틀(1.2초)이 덮고 있는 동안은 점이 그 위에 떨어진다
  await expect(page.locator('.chapter-title')).toHaveCount(0)
  expect(await pressableHeight(exit)).toBe(true)
})

test('단어장 보기 전환은 모양 밖까지 눌린다', async ({ page }) => {
  await open(page)
  await page.locator('.tabbar').getByRole('button', { name: '단어장' }).click()
  const toggles = page.locator('.wl-view button')
  await expect(toggles.first()).toBeVisible()
  for (const i of [0, 1]) expect(await pressableHeight(toggles.nth(i))).toBe(true)
})

test('찾기 안내 문구는 320px 에서도 입력칸 안에 다 들어간다', async ({ page }) => {
  await open(page, 320)
  await page.locator('.tabbar').getByRole('button', { name: '찾기', exact: true }).click()
  const input = page.getByLabel('읽기 또는 한자 검색')
  await expect(input).toBeVisible()
  const { need, have } = await input.evaluate((el: HTMLInputElement) => {
    const cs = getComputedStyle(el)
    const ctx = document.createElement('canvas').getContext('2d')!
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    return {
      need: ctx.measureText(el.placeholder).width,
      have: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    }
  })
  expect(need, `안내 문구 ${need}px > 쓸 수 있는 폭 ${have}px`).toBeLessThanOrEqual(have)
})
