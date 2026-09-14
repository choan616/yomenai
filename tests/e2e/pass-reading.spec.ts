// 모를 때 넘기는 길 — 아무 글자나 쳐서 오답을 만들지 않아도 된다 (테스터 피드백 2026-09-14).
// 핵심은 화면이 아니라 기록이다. 넘긴 카드는 오답으로 세되 **오답 유형이 안 붙어야** 한다 —
// 무엇을 잘못 골랐는지가 없는데 유형을 붙이면 진단 분포가 거짓이 된다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

interface ReviewRow {
  type: string
  cardType: string
  correct: boolean
  answer: string
  mistakeType: string | null
}

/** 이벤트 로그의 읽기 채점만 뽑는다 */
async function readingEvents(page: Page): Promise<ReviewRow[]> {
  return page.evaluate(
    () =>
      new Promise<ReviewRow[]>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readonly')
          const all = tx.objectStore('events').getAll()
          all.onsuccess = () =>
            res(
              (all.result as ReviewRow[]).filter(
                (e) => e.type === 'review' && e.cardType === 'reading',
              ),
            )
          all.onerror = () => res([])
        }
        req.onerror = () => res([])
      }),
  )
}

/** 읽기 입력칸이 열린 카드까지 간다. 도중의 확인 질문·뜻 카드는 넘긴다 */
async function advanceToReading(page: Page, budget = 12): Promise<void> {
  const input = page.locator('.kana-input')
  for (let i = 0; i < budget; i++) {
    const ask = page.getByRole('button', { name: '몰랐다', exact: true })
    if (await ask.isVisible().catch(() => false)) await ask.click()
    if (await input.isVisible().catch(() => false)) return

    const reveal = page.getByRole('button', { name: '뜻 보기', exact: true })
    if (await reveal.isVisible().catch(() => false)) await reveal.click()
    const dunno = page.getByRole('button', { name: '몰랐어요', exact: true })
    if (await dunno.isVisible().catch(() => false)) await dunno.click()
    await page
      .getByRole('button', { name: '다음', exact: true })
      .click({ timeout: 5_000 })
      .catch(() => {})
    await page.waitForTimeout(80)
  }
  throw new Error('읽기 카드를 못 만났다')
}

test('모르겠어요로 넘기면 정답이 보이고, 기록에 오답 유형이 안 붙는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 })
  await advanceToReading(page)

  // 입력칸이 무엇을 요구하는지 화면에 적혀 있다 — 직전이 "뜻은 알고 있었어요?" 라 오해를 샀다
  await expect(page.locator('.kana-input')).toHaveAttribute('placeholder', /히라가나/)

  const before = (await readingEvents(page)).length
  await page.getByRole('button', { name: '모르겠어요', exact: true }).click()

  // 넘기면 바로 정답 화면이다 — 읽기가 한자 위에 얹혀 나온다
  await expect(page.locator('.headword.has-ruby')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('.headword.has-ruby rt').first()).not.toBeEmpty()

  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(200)

  const rows = await readingEvents(page)
  expect(rows).toHaveLength(before + 1)
  const passed = rows[rows.length - 1]
  // 못 읽은 건 사실이라 오답으로 센다
  expect(passed.correct).toBe(false)
  expect(passed.answer).toBe('')
  // 그러나 무엇을 잘못 골랐는지가 없으므로 유형은 안 붙는다
  expect(passed.mistakeType).toBeNull()
})
