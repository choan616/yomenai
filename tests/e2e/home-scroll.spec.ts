// 폰에서 홈이 잘리지 않는지 — 세로로 키가 작을 때, 그리고 가로 모드 (2026-10-01).
//
// 홈은 가운데 정렬 칼럼이고 모바일에서는 문서가 스크롤하지 않는다(`index.css`). 그래서 내용이 화면보다
// 길면 **홈이 스스로 스크롤해야** 위(제목·세션 시작)도 아래(단어장·틀렸던 것)도 닿는다.
// - 세로: 진입로를 맨 아래 한 줄로 더하니 iPhone 크기(375×667)에서 탭바 밑에 반쯤 묻혔다 (사용자 캡처).
//   **클릭이 되는지만 보면 못 잡는다** — 누르는 점이 보이는 쪽에 걸리면 통과한다. 버튼 전체를 잰다.
// - 가로: 높이가 375px 안팎이라 홈이 세로로 안 들어간다 (사용자 지적 「메인에 스크롤을 막은 것은
//   가로모드에서 문제가 된다」). 가운데 정렬이 넘치면 위가 잘려 스크롤로도 못 닿는 것도 같이 본다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true })

/** 실사용처럼 「틀렸던 것」 줄·단어장 진입로까지 다 나오는 가장 긴 홈을 만든다 */
async function seed(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
    localStorage.setItem('yomenai:wordlistHint', '1')
  })
  await page.goto('/')
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 20).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const st = req.result.transaction('events', 'readwrite').objectStore('events')
        ids.forEach((idiomId, i) => {
          st.put({
            id: `0000${i}-seed`, userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'RENDAKU', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        st.put({
          id: '00999-star', userId: 'local', deviceId: 'e2e', at: Date.now(),
          idiomId: ids[0], cardType: 'reading', mistakeType: null, deletedAt: null,
          type: 'star', on: true,
        })
        st.transaction.oncomplete = () => done()
      }
    })
  })
  await page.reload()
  await expect(page.getByRole('button', { name: /^단어장/ })).toBeVisible({ timeout: 60_000 })
}

for (const [w, h] of [[360, 640], [375, 667]] as const) {
  test(`${w}×${h} 에서 홈의 단어장 진입로가 탭바에 안 가린다`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.setViewportSize({ width: w, height: h })
    await seed(page)

    const open = page.getByRole('button', { name: /^단어장/ })
    const box = await open.boundingBox()
    const tab = await page.locator('.tabbar').boundingBox()
    expect(box && tab).toBeTruthy()
    expect(
      box!.y + box!.height,
      `단어장 버튼 아래 ${Math.round(box!.y + box!.height)} · 탭바 위 ${Math.round(tab!.y)}`,
    ).toBeLessThanOrEqual(tab!.y)

    await open.click({ timeout: 5_000 })
    await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible()
  })
}

test.describe('가로 모드', () => {
  test.use({ viewport: { width: 667, height: 375 } })

  test('홈이 스크롤해서 위아래 끝까지 닿는다', async ({ page }) => {
    test.setTimeout(120_000)
    await seed(page)
    const home = page.locator('.home')

    // 위 — 제목이 화면 위로 잘리지 않는다
    await home.evaluate((el) => (el.scrollTop = 0))
    const h1Top = await page.locator('.home h1').evaluate((e) => e.getBoundingClientRect().top)
    expect(h1Top, `제목 위 ${Math.round(h1Top)}`).toBeGreaterThanOrEqual(0)

    // 아래 — 끝까지 내리면 마지막 줄이 탭바 위에 온다
    await home.evaluate((el) => (el.scrollTop = el.scrollHeight))
    const last = await home.evaluate((el) => el.lastElementChild!.getBoundingClientRect().bottom)
    const tabTop = await page.locator('.tabbar').evaluate((e) => e.getBoundingClientRect().top)
    expect(last, `마지막 줄 아래 ${Math.round(last)} · 탭바 위 ${Math.round(tabTop)}`).toBeLessThanOrEqual(tabTop)
  })
})
