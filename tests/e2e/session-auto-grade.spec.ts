// 정답의 등급을 응답 시간에서 정한다 — 「쉬웠다·헷갈렸다」 버튼은 없다 (2026-10-10 사용자 결정)
//
// 버튼이 있던 때 정답의 99% 가 「쉬웠다」였고, 그 표현이 더 덜 맞았다(다음 복습 66% vs 80%).
// 이제 정답은 「다음」 하나이고, 기록의 grade 는 Good(3)이다. 평소(정답 응답 시간의 중앙값)의 2배 넘게
// 걸리면 Hard(2) 다. 표본이 모자라면 Good.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

/** 明白 めいはく (코스 0 · 음독) */
const MEIHAKU = '1000220'

interface ReviewRow {
  type: string
  cardType: string
  idiomId: string
  grade: number
  correct: boolean
  at: number
}

async function putEvents(page: Page, events: Record<string, unknown>[]): Promise<void> {
  await page.evaluate(
    (events) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          for (const e of events) tx.objectStore('events').put(e)
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    events,
  )
}

const ev = (id: string, idiomId: string, over: Record<string, unknown>) => ({
  id,
  userId: 'local',
  deviceId: 'e2e',
  at: Date.now() - 86_400_000,
  idiomId,
  cardType: 'reading',
  mistakeType: null,
  deletedAt: null,
  type: 'review',
  grade: 1,
  answer: 'まちがい',
  expected: 'めいはく',
  correct: false,
  elapsedMs: 1000,
  ...over,
})

async function readingEvents(page: Page): Promise<ReviewRow[]> {
  return page.evaluate(
    () =>
      new Promise<ReviewRow[]>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const all = req.result.transaction('events', 'readonly').objectStore('events').getAll()
          all.onsuccess = () =>
            res((all.result as ReviewRow[]).filter((e) => e.type === 'review' && e.cardType === 'reading'))
          all.onerror = () => res([])
        }
        req.onerror = () => res([])
      }),
  )
}

async function openRematch(page: Page, seed: Record<string, unknown>[]): Promise<void> {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await putEvents(page, seed)
  await page.reload()
  await page.getByRole('button', { name: /재도전/ }).click()
  // 읽기 입력칸이 열릴 때까지 소개·뜻 카드를 넘긴다
  const input = page.locator('.kana-input')
  for (let i = 0; i < 12; i++) {
    if (await input.isVisible().catch(() => false)) return
    for (const name of ['몰랐다', '봤어요', '뜻 보기', '몰랐어요', '다음']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(80)
  }
  throw new Error('읽기 카드를 못 만났다')
}

test('정답 화면에는 「다음」 하나뿐이고, 평소 기준이 없으면 Good(3)으로 남는다', async ({ page }) => {
  await openRematch(page, [ev('seed-wrong', MEIHAKU, {})])
  await expect(page.locator('.headword').first()).toContainText('明白')

  await page.locator('.kana-input').fill('meihaku')
  await page.locator('.kana-input').press('Enter')

  const row = page.locator('.answer-row.single')
  await expect(row).toBeVisible()
  await expect(row.getByRole('button')).toHaveCount(1)
  await expect(page.getByRole('button', { name: '쉬웠다' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '헷갈렸다' })).toHaveCount(0)

  await row.getByRole('button', { name: '다음' }).click()
  await expect.poll(async () => (await readingEvents(page)).filter((e) => e.correct).length).toBe(1)
  const mine = (await readingEvents(page)).filter((e) => e.correct)
  expect(mine[0]!.grade).toBe(3)
})

test('평소보다 한참 느린 정답은 Hard(2)로 남는다', async ({ page }) => {
  // 평소 기준을 만든다 — 서로 다른 숙어 20개를 1초에 맞힌 기록(PACE_MIN_SAMPLE). 이 값의 2배가 기준선이다.
  // 지금 카드는 방금 전부터 떠 있으니 몇 초 걸린 셈이라 기준 1초의 2배를 넘는다
  const pace = Array.from({ length: 20 }, (_, i) =>
    ev(`pace-${i}`, String(2000000 + i), { correct: true, grade: 3, elapsedMs: 100, answer: 'x', expected: 'x' }),
  )
  await openRematch(page, [ev('seed-wrong', MEIHAKU, {}), ...pace])
  await expect(page.locator('.headword').first()).toContainText('明白')
  await page.waitForTimeout(800) // 기준(100ms)의 2배를 확실히 넘긴다

  await page.locator('.kana-input').fill('meihaku')
  await page.locator('.kana-input').press('Enter')
  await page.locator('.answer-row.single').getByRole('button', { name: '다음' }).click()

  await expect
    .poll(async () => (await readingEvents(page)).filter((e) => e.correct && e.idiomId === MEIHAKU).length)
    .toBe(1)
  const mine = (await readingEvents(page)).filter((e) => e.correct && e.idiomId === MEIHAKU)
  expect(mine[0]!.grade).toBe(2)
})
