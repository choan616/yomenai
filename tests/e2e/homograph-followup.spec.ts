// 동형이독 이어 묻기 (2026-09-14). 市場 처럼 한 표기에 읽기가 둘인 숙어에서
// 다른 쪽 읽기로 답하면, 정답 처리하고 넘어가는 대신 **이 카드의 읽기를 한 번 더 묻는다.**
//
// 代替 를 쓴다 — だいたい 와 だいがわり 가 각각 자기만 쓰는 음독 쌍을 가져서
// 오답 하나만 심으면 재도전 세션에 그 카드 한 장이 결정적으로 뜬다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

const DAITAI = '1581470' // 代替 だいたい
const DAIGAWARI = '1824770' // 代替 だいがわり

interface ReviewRow {
  id: string
  type: string
  cardType: string
  idiomId: string
  expected: string
  answer: string
  correct: boolean
  mistakeType: string | null
}

async function resetState(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
    return new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.reload()
}

/**
 * 代替 だいたい 를 한 번 틀린 것으로 심는다 — 재도전 후보가 된다.
 * 진단 완료 플래그도 같이 세운다. 안 세우면 홈이 첫 진입 화면이라 「틀렸던 것」 줄이
 * 아예 안 그려진다 (Home.tsx 의 needsDiagnostic).
 */
async function seedWrong(page: Page, idiomId: string): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.evaluate(
    (id) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          tx.objectStore('events').put({
            id: '00000000-seed',
            userId: 'local',
            deviceId: 'e2e',
            at: Date.now() - 86_400_000,
            idiomId: id,
            cardType: 'reading',
            mistakeType: null,
            deletedAt: null,
            type: 'review',
            grade: 1,
            answer: 'まちがい',
            expected: 'だいたい',
            correct: false,
            elapsedMs: 1000,
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    idiomId,
  )
  await page.reload()
}

/** 읽기 입력칸이 열릴 때까지 소개·뜻 카드를 넘긴다 */
async function advanceToReading(page: Page, budget = 12): Promise<void> {
  const input = page.locator('.kana-input')
  for (let i = 0; i < budget; i++) {
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

test('다른 읽기로 맞히면 이어 묻고, 두 읽기가 각자의 카드에 기록된다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedWrong(page, DAITAI)

  await page.getByRole('button', { name: /재도전/ }).click()
  await advanceToReading(page)
  await expect(page.locator('.headword').first()).toContainText('代替')

  // 다른 쪽 읽기로 답한다 — 맞는 답이지만 이 카드가 묻는 읽기는 아니다
  await page.locator('.kana-input').fill('daigawari')
  await page.locator('.kana-input').press('Enter')

  // 넘어가지 않고 제외 조건을 붙여 다시 묻는다
  const prompt = page.locator('.follow-up')
  await expect(prompt).toBeVisible({ timeout: 5_000 })
  await expect(prompt).toContainText('だいがわり')
  await expect(prompt).toContainText('그것 말고')
  // 아직 판정이 안 났다 — 정답/오답 화면이면 안 된다
  await expect(page.locator('.card.feedback')).toHaveCount(0)

  // 이번엔 이 카드의 읽기를 쓴다
  await page.locator('.kana-input').fill('daitai')
  await page.locator('.kana-input').press('Enter')
  await expect(page.locator('.card.feedback.is-ok')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.rule-hint')).toContainText('だいがわり')

  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(300)

  const rows = await readingEvents(page)
  // 이 카드 — 이어 묻기에서 맞혔다
  const own = rows.filter((e) => e.idiomId === DAITAI && e.id !== '00000000-seed')
  expect(own.some((e) => e.correct && e.expected === 'だいたい')).toBe(true)
  // 맞힌 쪽 숙어에도 정답이 남는다. 두 읽기는 처음부터 별도 카드다
  const sib = rows.filter((e) => e.idiomId === DAIGAWARI)
  expect(sib.length, 'だいがわり 숙어에 이벤트가 없다').toBeGreaterThan(0)
  expect(sib[0]).toMatchObject({ correct: true, expected: 'だいがわり', mistakeType: null })
})
