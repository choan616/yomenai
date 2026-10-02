// 읽기마다 뜻이 다른 말을 「읽기 둘」 항목으로 (2026-10-02, context-notes 「읽기 둘 항목으로」).
//
// 임포트가 JMdict 한 항목에서 읽기를 하나만 골라서 둘째 읽기가 사전에 없었다. 뜻이 갈린 읽기는
// 별도 항목(형제)으로 올리고, 뜻이 같은 읽기는 채점만 받아준다 — 이 둘이 앱에서 실제로 맞물리는지 본다.
//
// 入水 를 쓴다 — じゅすい(1582840)와 にゅうすい(형제 1582840-nyuusui)가 둘 다 음독이고 밴드 3 이라 기본
// 설정에서 한 풀에 같이 든다. 逆手 는 못 쓴다: さかて 가 훈독이라 훈독 0% 인 기본 풀에는 짝이 안 들어온다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

const JUSUI = '1582840' // 入水 じゅすい
const NYUUSUI = '1582840-nyuusui' // 入水 にゅうすい — JMdict 가 읽기별로 뜻을 가른 형제
const ANPI = '1154230' // 安否 あんぴ — あんぷ 는 뜻이 같아 채점만 받는다

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

/** 한 번 틀린 것으로 심는다 — 재도전 후보가 된다. 진단 완료 플래그도 같이 세운다 */
async function seedWrong(page: Page, idiomId: string, expected: string): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.evaluate(
    ([id, exp]) =>
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
            expected: exp,
            correct: false,
            elapsedMs: 1000,
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [idiomId, expected] as const,
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

test('뜻이 갈린 읽기는 형제 항목이라 「읽기 둘」 카드로 묻고, 기록은 쓴 읽기의 항목에 남는다', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedWrong(page, JUSUI, 'じゅすい')

  await page.getByRole('button', { name: /재도전/ }).click()
  await advanceToReading(page)
  await expect(page.locator('.headword').first()).toContainText('入水')

  // 사전에 없던 읽기가 이제 짝이다 — 답을 쓰기 전부터 둘이라고 말한다
  const dualTag = page.locator('.card-head').getByText(/읽기 둘/)
  await expect(dualTag).toBeVisible({ timeout: 5_000 })
  await expect(dualTag).toContainText('1/2')

  // 형제 쪽 읽기부터 쓴다 — 전엔 이 읽기가 정답으로 안 잡혔다
  await page.locator('.kana-input').fill('nyuusui')
  await page.locator('.kana-input').press('Enter')
  await expect(dualTag).toContainText('2/2')
  const done = page.locator('.dual-slot.done')
  await expect(done).toHaveCount(1)
  await expect(done).toContainText('にゅうすい')

  await page.locator('.kana-input').fill('jusui')
  await page.locator('.kana-input').press('Enter')
  await expect(page.locator('.card.feedback.is-ok')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(300)

  const rows = (await readingEvents(page)).filter((e) => e.id !== '00000000-seed')
  // 형제는 자기 id 로 기록이 남는다 — 스키마는 그대로, idiomId 가 새 문자열일 뿐이다
  const sib = rows.filter((e) => e.idiomId === NYUUSUI)
  expect(sib.length, '형제 항목에 이벤트가 없다').toBeGreaterThan(0)
  expect(sib[0]).toMatchObject({ correct: true, expected: 'にゅうすい', mistakeType: null })
  const own = rows.filter((e) => e.idiomId === JUSUI)
  expect(own.some((e) => e.correct && e.expected === 'じゅすい')).toBe(true)
})

test('뜻이 같은 다른 읽기는 항목이 아니라 채점만 받는다 — 안부 あんぷ', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedWrong(page, ANPI, 'あんぴ')

  await page.getByRole('button', { name: /재도전/ }).click()
  await advanceToReading(page)
  await expect(page.locator('.headword').first()).toContainText('安否')
  // 별도 항목이 없으니 「읽기 둘」 카드가 아니다
  await expect(page.locator('.card-head').getByText(/읽기 둘/)).toHaveCount(0)

  // JMdict 에 있는 다른 읽기(あんぷ)가 전엔 오답이었다 — 일본어로는 맞는데 틀렸다고 했다
  await page.locator('.kana-input').fill('anpu')
  await page.locator('.kana-input').press('Enter')
  await expect(page.locator('.card.feedback.is-ok')).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(300)

  const fresh = (await readingEvents(page)).filter((e) => e.id !== '00000000-seed')
  expect(fresh).toHaveLength(1)
  expect(fresh[0]).toMatchObject({ idiomId: ANPI, correct: true, mistakeType: null })
})
