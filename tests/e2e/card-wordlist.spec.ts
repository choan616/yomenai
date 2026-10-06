// 카드에서 단어장에 담기 (2026-10-06 사용자 지시) — 다시보기에서 담으면 단어장에 들어간다.
//
// 못 박는 것 둘 — 담기는 **「다음」이 있는 장에만** 뜨고(마지막 장은 「다른 N개」·「돌아가기」가
// 서는 자리라 버튼 넷이 375px 에 안 들어간다), **단어장 카드 보기에는 담기가 없다**(이미 담은
// 것들이고 카드에 관리 기능을 두지 않는다는 2026-10-01 결정).
import { expect, test, type Page } from '@playwright/test'
import { openBrowse as openBrowseSheet } from './report-sheets.js'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

/** 다시보기 후보를 만든다 — 오답을 심는다 (browse-mask.spec.ts 와 같은 방식) */
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
  await openBrowseSheet(page)
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  await expect(page.locator('.browse-slide').first()).toBeVisible({ timeout: 20_000 })
}

test('다시보기에서 담으면 단어장에 들어간다', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await openBrowse(page)

  const nav = page.locator('.browse-nav')
  // 루비가 붙어 있어 표기만 모은다 — innerText 는 읽기까지 섞여 온다
  const word = await page
    .locator('.browse-slide')
    .first()
    .locator('.headword')
    .evaluate((el) =>
      [...el.querySelectorAll('ruby')].map((r) => r.firstChild?.textContent ?? '').join(''),
    )

  // 담기는 「다음」 오른쪽이고, 줄은 넘치지 않는다
  const add = nav.getByRole('button', { name: '단어장에 담기' })
  await expect(add).toHaveText('+ 단어장')
  const row = nav.locator('.answer-row')
  const rowBox = (await row.boundingBox())!
  const addBox = (await add.boundingBox())!
  expect(Math.round(rowBox.x + rowBox.width - (addBox.x + addBox.width))).toBeLessThanOrEqual(1)
  const nextBox = (await nav.getByRole('button', { name: '다음 ›' }).boundingBox())!
  expect(addBox.x).toBeGreaterThan(nextBox.x)

  await add.click()
  await expect(nav.getByRole('button', { name: '단어장에서 빼기' })).toHaveText('담았어요')

  // 다음 장은 안 담긴 상태다 — 담기는 지금 장에만 걸린다
  await nav.getByRole('button', { name: '다음 ›' }).click()
  await expect(page.locator('.browse-screen .count')).toContainText('2 / ')
  await expect(nav.getByRole('button', { name: '단어장에 담기' })).toBeVisible()

  // 단어장에 그 말이 있다 (요미가나를 뺀 한자 표기로 찾는다)
  await page.getByRole('button', { name: '다시보기 나가기' }).click()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible()
  await expect(page.locator('.review-row')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator('.review-row .r-main').first()).toHaveText(word)
})

test('마지막 장에는 담기가 없다 — 그 자리엔 다른 N개와 돌아가기가 선다', async ({ page }) => {
  test.setTimeout(120_000)
  await seed(page)
  await openBrowse(page)

  const nav = page.locator('.browse-nav')
  const count = page.locator('.browse-screen .count')
  const total = Number((await count.innerText()).split('/')[1]!.trim())
  await page.evaluate((n) => {
    const el = document.querySelector('.browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = (n - 1) * el.clientWidth
  }, total)
  await expect(count).toContainText(`${total} / ${total}`)

  await expect(nav.getByRole('button', { name: '돌아가기' })).toBeVisible()
  await expect(nav.getByRole('button', { name: /단어장에/ })).toHaveCount(0)
})

test('단어장 카드 보기에는 담기가 없다', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const st = req.result.transaction('events', 'readwrite').objectStore('events')
          st.put({
            id: 'wl-card-1', userId: 'local', deviceId: 'e2e', at: Date.now(),
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.transaction.oncomplete = () => res()
          st.transaction.onerror = () => rej(new Error('심기 실패'))
        }
      }),
  )
  await page.reload()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await page.getByRole('button', { name: '카드' }).click()
  await expect(page.locator('.wl-deck .browse-slide')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /단어장에/ })).toHaveCount(0)
})
