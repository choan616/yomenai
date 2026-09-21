// 다시보기 요미가나 가리기 (2026-09-21 사용자 요청) — 덮었다가 눌러서 벗긴다.
//
// 기록을 심어 후보를 만든다. 무작위로 풀어서 쌓으면 카드 수가 들쭉날쭉해 「옆 카드는
// 그대로 가려져 있다」를 못 본다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function seed(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 40).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        ids.forEach((idiomId, i) => {
          store.put({
            id: `00000${String(i).padStart(3, '0')}-seed`,
            userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'SOKUON', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        tx.oncomplete = () => done()
      }
    })
  })
  await page.reload()
}

async function openBrowse(page: Page): Promise<void> {
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  await expect(page.locator('.browse-slide').first()).toBeVisible({ timeout: 20_000 })
}

/** 글자가 안 보이게 덮여 있나 */
const hidden = (page: Page, nth: number) =>
  page
    .locator('.browse-slide')
    .nth(nth)
    .locator('rt')
    .first()
    .evaluate((el) => getComputedStyle(el).color === 'rgba(0, 0, 0, 0)')

test('요미가나를 덮었다가 눌러서 벗긴다', async ({ page }) => {
  await seed(page)
  await openBrowse(page)

  const slide = page.locator('.browse-slide').first()
  const reveal = slide.getByRole('button', { name: '읽기 보기' })

  // 기본은 가림이다
  expect(await hidden(page, 0)).toBe(true)
  await expect(reveal).toBeVisible()

  // 막대 길이가 다 같다 — 길이가 다르면 덮은 채로 읽기가 몇 자인지 드러난다 (2026-09-21).
  // **한 장이 아니라 30장 전부**를 본다. 읽기가 한 자인 것과 네 자인 것이 섞여 있어야
  // 이 검사가 뜻이 있다
  // **그려진 폭**을 잰다 — 배경은 제 상자 밖으로 못 나가므로 설정값이 아니라
  // min(설정값, 상자 폭)이 실제 막대다 (2026-09-21 실기기에서 여기 걸렸다)
  const painted = await page.locator('.browse-slide rt').evaluateAll((els) =>
    els.map((el) => {
      const box = el.getBoundingClientRect().width
      const set = Number.parseFloat(getComputedStyle(el).backgroundSize.split(' ')[0])
      return [String(Math.round(Math.min(set, box))), Math.round(box)] as [string, number]
    }),
  )
  expect(painted.length).toBeGreaterThan(30)
  const bars = painted.map(([w]) => w)
  expect(new Set(bars).size).toBe(1)
  // 막대가 실제로 그려져 있다 (0px 이면 위 검사가 헛돈다)
  expect(Number.parseFloat(bars[0])).toBeGreaterThan(4)
  // **글자 상자는 제각각인데 막대만 같다** — 막대가 읽기 길이를 안 따라간다는 뜻이다.
  // 이 줄이 없으면 글자 상자까지 다 같은 경우에도 위 검사가 통과한다
  expect(new Set(painted.map(([, w]) => w)).size).toBeGreaterThan(1)

  // 벗겨도 카드가 안 움직인다 — 세로(한자가 내려앉음)와 가로(루비 열이 넓어짐) 둘 다 본다
  const boxes = () => slide.locator('ruby').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]
    }),
  )
  const before = await slide.locator('.headword').boundingBox()
  const rubyBefore = await boxes()
  await reveal.click()
  expect(await hidden(page, 0)).toBe(false)
  expect(await slide.locator('.headword').boundingBox()).toEqual(before)
  expect(await boxes()).toEqual(rubyBefore)
  // 버튼은 자리를 지키며 반대말이 된다 — 치우면 한 줄이 빠져 한자가 내려앉는다
  await expect(slide.getByRole('button', { name: '다시 가리기' })).toBeVisible()
  await slide.getByRole('button', { name: '다시 가리기' }).click()
  expect(await hidden(page, 0)).toBe(true)
  expect(await slide.locator('.headword').boundingBox()).toEqual(before)
  await reveal.click()

  // 옆 카드는 그대로 덮여 있다 — 벗김은 지금 보는 장에만 걸린다
  expect(await hidden(page, 1)).toBe(true)

  // 떠났다 오면 다시 덮인다 (예문·규칙과 같은 관례)
  const go = (i: number) =>
    page.evaluate((n) => {
      const el = document.querySelector('.browse-track')
      if (el === null) throw new Error('.browse-track 없음')
      el.scrollLeft = n * el.clientWidth
    }, i)
  const count = page.locator('.browse-screen .count')
  await go(1)
  await expect(count).toContainText('2 / ')
  await go(0)
  await expect(count).toContainText('1 / ')
  expect(await hidden(page, 0)).toBe(true)
  await expect(reveal).toBeVisible()
})

test('설정에서 끄면 처음부터 보인다', async ({ page }) => {
  await seed(page)
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page
    .getByRole('group', { name: '다시보기 요미가나' })
    .getByRole('button', { name: '안 가림' })
    .click()

  await openBrowse(page)
  expect(await hidden(page, 0)).toBe(false)
  await expect(page.getByRole('button', { name: '읽기 보기' })).toHaveCount(0)
})
