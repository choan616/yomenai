// 세션 요약의 「바로잡은 표현」 칸 — 정답률 칸을 대신하고, 이번 세션에 늘어난 수가 +N 으로 붙는다 (PLAN §11 S2·D5)
//
// 交渉 こうしょう 를 쓴다. 오답 3회로 상습이 된 뒤 10일 전에 한 번 맞혔다면, 이번 세션의 정답이 연속 2회째이고
// 첫 정답에서 7일을 넘으므로 바로잡힌 것으로 센다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

const KOUSHOU = '1272110' // 交渉 こうしょう
const DAY = 86_400_000

let seq = 0
const review = (idiomId: string, ok: boolean, ago: number) => ({
  id: `corrected-${seq++}`, userId: 'local', deviceId: 'e2e', at: Date.now() - ago,
  idiomId, cardType: 'reading', mistakeType: null, deletedAt: null,
  type: 'review', grade: ok ? 3 : 1, answer: ok ? 'こうしょう' : 'ぬぬぬ', expected: 'こうしょう', correct: ok, elapsedMs: 1500,
})
const star = (idiomId: string) => ({
  id: `corrected-star-${seq++}`, userId: 'local', deviceId: 'e2e', at: Date.now() - 1000,
  idiomId, cardType: 'reading', mistakeType: null, deletedAt: null, type: 'star', on: true,
})

async function ready(page: Page): Promise<void> {
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

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

/** 세션이 끝날 때까지 한 걸음씩 — 읽기 카드는 `answers[표기]` 로, 없으면 ぬぬぬ 로 답한다 */
async function playToEnd(page: Page, answers: Record<string, string>): Promise<void> {
  for (let i = 0; i < 400; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) return
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      continue
    }
    if (await clickIfVisible(page, '건너뛰기')) continue
    if (await clickIfVisible(page, '봤어요')) continue
    if (await clickIfVisible(page, '알고 있었다')) continue
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      const head = (await page.locator('.card .headword').first().innerText().catch(() => '')).trim()
      await input.fill(answers[head] ?? 'nununu')
      await input.press('Enter')
      continue
    }
    if (await clickIfVisible(page, '뜻 보기')) continue
    if (await clickIfVisible(page, '알았어요')) continue
    await page.waitForTimeout(30)
  }
  throw new Error('세션이 끝나지 않았다')
}

async function startNormal(page: Page, rows: Record<string, unknown>[]): Promise<void> {
  await ready(page)
  await putEvents(page, rows)
  await page.reload()
  await page.getByRole('button', { name: '세션 시작', exact: true }).click()
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })
}

const stat = (page: Page, label: string) => page.locator('.summary-stats > div').filter({ has: page.locator('dt', { hasText: label }) })

test('이번 세션에서 바로잡으면 누적 수에 +1 이 붙고 정답률 칸은 없다', async ({ page }) => {
  await startNormal(page, [
    review(KOUSHOU, false, 30 * DAY),
    review(KOUSHOU, false, 29 * DAY),
    review(KOUSHOU, false, 28 * DAY),
    review(KOUSHOU, true, 10 * DAY), // 연속 1회째 — 이번 정답이 2회째, 첫 정답에서 10일
    star(KOUSHOU),
  ])
  await playToEnd(page, { 交渉: 'koushou' })
  await expect(page.getByText('세션 완료')).toBeVisible()

  const cell = stat(page, '바로잡은 표현')
  await expect(cell).toHaveCount(1)
  await expect(cell.locator('dd')).toHaveText(/^1\s*\+1$/)
  await expect(page.locator('.summary-stats dt', { hasText: '정답률' })).toHaveCount(0)
  await expect(page.locator('.summary-stats')).not.toContainText('%')
  // 정답 수는 도넛 옆 숫자가 말한다
  await expect(page.locator('.summary-num')).toContainText('/')
  // 다른 칸은 그대로 있다
  await expect(page.locator('.summary-stats dt')).toHaveText(['바로잡은 표현', '새 음독', '주 오답'])
})

test('바로잡은 게 없으면 0 이고 +N 은 없다', async ({ page }) => {
  // 오답 3회뿐 — 이번에 맞혀도 연속 1회째라 아직 바로잡히지 않는다
  await startNormal(page, [
    review(KOUSHOU, false, 30 * DAY),
    review(KOUSHOU, false, 29 * DAY),
    review(KOUSHOU, false, 28 * DAY),
    star(KOUSHOU),
  ])
  await playToEnd(page, { 交渉: 'koushou' })

  const cell = stat(page, '바로잡은 표현')
  await expect(cell.locator('dd')).toHaveText('0')
  await expect(cell.locator('dd .dim')).toHaveCount(0)
  await expect(page.locator('.summary-stats dt', { hasText: '정답률' })).toHaveCount(0)
})
