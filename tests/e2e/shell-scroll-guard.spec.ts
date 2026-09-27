// 셸 화면에서 문서가 밀려 올라가면 되돌린다 (2026-09-26 사용자 보고).
//
// 하단 탭바가 `position: sticky; bottom: 0` 이라 문서가 밀리면 **손가락을 따라 같이
// 올라간다**. 모바일에서 스크롤하는 것은 `.screen` 이고 문서는 안 움직이는 게 정상인데,
// iOS 가 포커스된 입력을 보이려고 문서를 올리고 자판이 내려가도 안 되돌린다.
//
// 크롬은 그 밀어 올림을 흉내 내지 못한다. 그래서 **밀린 상태를 직접 만들고** 가드가
// 0 으로 되돌리는지를 본다 — 고치려는 계약이 그것이다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function openWordlist(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible({ timeout: 60_000 })
}

test('문서는 손가락으로 못 움직인다 — 스크롤러는 .screen 이다', async ({ page }) => {
  test.setTimeout(120_000)
  await openWordlist(page)

  // `overflow: hidden` 은 **손가락 스크롤만** 막는다 (프로그램 스크롤은 그대로 된다).
  // 막으려던 것이 손가락 쪽이라 계약을 그대로 확인한다
  const style = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).overflowY,
    body: getComputedStyle(document.body).overflowY,
    screen: getComputedStyle(document.querySelector('.screen')!).overflowY,
  }))
  expect(style.html).toBe('hidden')
  expect(style.body).toBe('hidden')
  // 화면 안 스크롤은 살아 있어야 한다 — 이걸 같이 죽이면 목록을 못 내린다
  expect(style.screen).toBe('auto')
})

test('그래도 밀렸으면 자판이 내려갈 때 되돌린다', async ({ page }) => {
  test.setTimeout(120_000)
  await openWordlist(page)

  // iOS 가 포커스된 입력을 보이려고 문서를 올린 상태를 흉내 낸다
  await page.evaluate(() => {
    document.documentElement.style.minHeight = '3000px'
    window.scrollTo(0, 400)
  })
  expect(await page.evaluate(() => window.scrollY)).toBe(400)

  // **스크롤마다 되돌리지 않는다** — 손가락과 싸우면 화면이 떤다 (2026-09-26 사용자 보고).
  // 자판이 오르내릴 때만 한 번씩 본다
  await page.evaluate(() => window.dispatchEvent(new FocusEvent('focusout')))
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
})

test('목록 중간 행에서 포커스가 걸려도 되돌린다 — 뜻 검수의 「고치기」', async ({ page }) => {
  test.setTimeout(120_000)
  await openWordlist(page)

  // 뷰포트 높이는 안 바뀌고(3분할 화면이 아니라 목록 중간에서 입력이 생기는 자리라
  // visualViewport resize 가 안 뜨거나 늦을 수 있다) **포커스만** 걸리는 상황을 흉내 낸다.
  // rAF 로 다음 프레임에 바로 되돌리므로, 밀린 값을 확인하는 시점을 따로 안 둔다 —
  // 라운드트립 사이에 이미 되돌아가 있을 수 있어 그 확인 자체가 들쭉날쭉하다
  await page.evaluate(() => {
    document.documentElement.style.minHeight = '3000px'
    window.scrollTo(0, 400)
    const el = document.createElement('input')
    document.body.append(el)
    el.focus()
    el.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  })

  // rAF 뒤 한 번, 350ms 뒤 한 번 — 둘 다 한 번씩이라 연속 되돌리기(떨림)가 아니다
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 1000 }).toBe(0)
})

// PC 회귀는 따로 안 둔다 — 나머지 e2e 전부가 PC 크기로 돌아서, 문서 스크롤이 죽으면
// scrollIntoViewIfNeeded 를 쓰는 스펙들이 먼저 깨진다. CSS 와 가드가 같은 미디어 질의로
// PC 를 제외한다
