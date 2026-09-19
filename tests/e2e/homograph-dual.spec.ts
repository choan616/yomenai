// 「읽기 둘」 카드 (2026-09-14). 한 표기에 읽기가 둘인 말은 한 장으로 접어
// **처음부터 둘 다 묻는다.** 답을 보고 발동하면 같은 실력이 순서에 따라 다르게
// 처리되고, 맞는 읽기를 쓰고도 카드가 오답이 된다.
//
// 기록 규칙은 한 줄이다 — 쓴 읽기의 카드에만 정답을 남기고 못 쓴 쪽에는 아무것도
// 안 남긴다. 오답은 어느 읽기로도 못 읽었을 때만 생긴다.
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

test('처음부터 둘 다 묻고, 쓴 읽기의 카드에만 정답이 남는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedWrong(page, DAITAI)

  await page.getByRole('button', { name: /재도전/ }).click()
  await advanceToReading(page)
  await expect(page.locator('.headword').first()).toContainText('代替')

  // 답을 쓰기 전부터 둘이라고 말한다 — 답을 보고 발동하는 게 아니다.
  // 「둘이다」와 진행률은 헤더 태그에 있다(2026-09-14, 본문 스크롤 지적 반영).
  const dualTag = page.locator('.card-head').getByText(/읽기 둘/)
  await expect(dualTag).toBeVisible({ timeout: 5_000 })
  await expect(dualTag).toContainText('1/2')
  // 첫 질문엔 답 칸 두 개가 다 비어 있다 (2026-09-15) — 아직 맞힌 읽기가 없다
  await expect(page.locator('.dual-slot')).toHaveCount(2)
  await expect(page.locator('.dual-slot.done')).toHaveCount(0)

  // 상대 쪽 읽기부터 쓴다 — 순서는 상관없어야 한다
  await page.locator('.kana-input').fill('daigawari')
  await page.locator('.kana-input').press('Enter')

  // 판정이 아직 안 났고, 쓴 읽기를 제외 조건으로 못박아 다시 묻는다
  await expect(page.locator('.card.feedback')).toHaveCount(0)
  await expect(dualTag).toContainText('2/2')
  // 맞힌 읽기가 한 칸을 채우고 나머지 한 칸은 비어 있다 — 「그것 말고」 같은 지시어를
  // 안 쓴다. 어순 때문에 그 읽기를 쓰라는 뜻으로 뒤집혀 읽혔다 (2026-09-15)
  const done = page.locator('.dual-slot.done')
  await expect(done).toHaveCount(1)
  await expect(done).toContainText('だいがわり')
  await expect(page.locator('.dual-slot:not(.done)')).toHaveCount(1)

  await page.locator('.kana-input').fill('daitai')
  await page.locator('.kana-input').press('Enter')
  await expect(page.locator('.card.feedback.is-ok')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.rule-hint')).toContainText('두 읽기를 다 맞혔어요')

  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(300)

  const rows = await readingEvents(page)
  // 두 읽기가 각자의 카드에 정답으로 남는다. 처음부터 별도 숙어라 스키마는 그대로다
  const own = rows.filter((e) => e.idiomId === DAITAI && e.id !== '00000000-seed')
  expect(own.some((e) => e.correct && e.expected === 'だいたい')).toBe(true)
  const sib = rows.filter((e) => e.idiomId === DAIGAWARI)
  expect(sib.length, 'だいがわり 숙어에 이벤트가 없다').toBeGreaterThan(0)
  expect(sib[0]).toMatchObject({ correct: true, expected: 'だいがわり', mistakeType: null })
})

// 한쪽만 아는 사람이 맞는 읽기를 쓰고도 정답률이 깎이면 안 된다 (사용자 지적 2026-09-14)
test('한쪽만 쓰고 넘기면 그 읽기는 정답으로 남고 오답은 안 생긴다', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.home')).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedWrong(page, DAITAI)

  await page.getByRole('button', { name: /재도전/ }).click()
  await advanceToReading(page)
  await expect(page.locator('.headword').first()).toContainText('代替')

  await page.locator('.kana-input').fill('daigawari')
  await page.locator('.kana-input').press('Enter')
  await page.getByRole('button', { name: 'SKIP', exact: true }).click()

  await expect(page.locator('.card.feedback.is-ok')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('.rule-hint')).toContainText('아직 안 배운 것')
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.waitForTimeout(300)

  const rows = await readingEvents(page)
  const fresh = rows.filter((e) => e.id !== '00000000-seed')
  // 쓴 읽기만 남는다
  expect(fresh).toHaveLength(1)
  expect(fresh[0]).toMatchObject({ idiomId: DAIGAWARI, correct: true, expected: 'だいがわり' })
  // 못 쓴 쪽에는 오답이 안 생긴다 — 아직 안 배운 카드로 남는다
  expect(fresh.some((e) => e.idiomId === DAITAI)).toBe(false)
})
