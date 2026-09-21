// 다시보기 마지막 장 — 한 벌 더 뽑거나 나가거나 (2026-09-21 사용자 요청).
//
// 후보가 화면 한 벌(30장)보다 많아야 「다른 30개」가 뜬다. 무작위로 풀어서는 그만큼
// 안 쌓이므로 **기록을 심는다** (`contrast-session.spec.ts` 와 같은 이유).
import { expect, test } from '@playwright/test'

// 한 손 조작 전제의 폭에서 본다 — 버튼 셋이 들어가는지는 넓은 화면에서 안 드러난다
test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

/** 한 벌(30장)보다 넉넉히 많게 — 「다른 30개」가 진짜 다른 것들로 채워지는지 보려면 두 벌은 있어야 한다 */
const SEED_COUNT = 70

test('마지막 장에서 다른 30개를 부르거나 돌아간다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })

  const seeded = await page.evaluate(async (count: number) => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, count).map((i) => i.id)
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
    return ids.length
  }, SEED_COUNT)
  expect(seeded).toBe(SEED_COUNT)

  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()

  const slides = page.locator('.browse-slide')
  const count = page.locator('.browse-screen .count')
  const nav = page.locator('.browse-nav')
  await expect(slides).toHaveCount(30)

  const first = await slides.locator('.headword').allInnerTexts()

  // 마지막 장으로. 거기서만 「다른 30개」와 「돌아가기」가 나온다
  await expect(nav.getByRole('button', { name: '다른 30개 ›' })).toHaveCount(0)
  await expect(nav.getByRole('button', { name: '돌아가기' })).toHaveCount(0)

  /** 버튼 줄의 오른쪽 끝이 줄 자체의 오른쪽 끝과 맞나 — 빈 자리로 쏠려 있지 않은지 */
  const gap = async () => {
    const row = nav.locator('.answer-row')
    const rowBox = (await row.boundingBox())!
    const buttons = row.locator('button')
    const lastBtn = (await buttons.nth((await buttons.count()) - 1).boundingBox())!
    // 음수면 넘친 것이다 — 좁은 화면에서 버튼 셋이 안 들어가는 경우를 같이 잡는다
    return Math.abs(Math.round(rowBox.x + rowBox.width - (lastBtn.x + lastBtn.width)))
  }
  // 마지막 장이 아닌 곳에서도 줄이 폭을 다 쓴다 (2026-09-21 사용자 지적)
  expect(await gap()).toBeLessThanOrEqual(1)
  const prevMid = await nav.getByRole('button', { name: '‹ 이전' }).boundingBox()
  await page.evaluate(() => {
    const el = document.querySelector('.browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = 29 * el.clientWidth
  })
  await expect(count).toContainText('30 / 30')
  await expect(nav.getByRole('button', { name: '다른 30개 ›' })).toBeVisible()
  await expect(nav.getByRole('button', { name: '돌아가기' })).toBeVisible()

  // 「돌아가기」가 늘어도 이전 버튼은 같은 자리·같은 폭이고, 줄은 여전히 폭을 다 쓴다
  const prevBox = await nav.getByRole('button', { name: '‹ 이전' }).boundingBox()
  expect(prevBox).toEqual(prevMid)
  expect(await gap()).toBeLessThanOrEqual(1)

  await nav.getByRole('button', { name: '다른 30개 ›' }).click()
  await expect(count).toContainText('1 / 30')
  const second = await slides.locator('.headword').allInnerTexts()
  expect(second).toHaveLength(30)
  // 후보가 70개라 **안 본 것으로만** 한 벌이 채워진다
  expect(second.filter((w) => first.includes(w))).toEqual([])
  expect(await nav.getByRole('button', { name: '‹ 이전' }).boundingBox()).toEqual(prevBox)

  // 두 벌째의 마지막 장에서 돌아가면 리포트다
  await page.evaluate(() => {
    const el = document.querySelector('.browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = 29 * el.clientWidth
  })
  await expect(count).toContainText('30 / 30')
  await nav.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.locator('.report')).toBeVisible()
})

/**
 * 후보가 한 벌을 겨우 넘길 때. 두 벌째는 안 본 것 몇 장 + 이미 본 것으로 메워지므로
 * **같은 숙어가 같은 자리에 남는다** — 그래도 첫 장으로 돌아와야 한다.
 */
test('후보가 적어 겹쳐도 첫 장으로 돌아온다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 35).map((i) => i.id)
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
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()

  const slides = page.locator('.browse-slide')
  const count = page.locator('.browse-screen .count')
  const nav = page.locator('.browse-nav')
  await expect(slides).toHaveCount(30)

  await page.evaluate(() => {
    const el = document.querySelector('.browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = 29 * el.clientWidth
  })
  await expect(count).toContainText('30 / 30')
  await nav.getByRole('button', { name: '다른 30개 ›' }).click()

  await expect(count).toContainText('1 / 30')
  await expect(slides).toHaveCount(30)
})
