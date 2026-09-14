// 처음 만나는 숙어는 시험 대신 소개로 나온다 (2026-09-13)
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

/**
 * 소개는 읽기 채점이 `INTRO_MIN_READINGS`(30) 이상 쌓여야 시작된다 — 처음부터
 * 설명하지 않고 먼저 풀게 한다 (2026-09-13). 세션을 여러 번 돌리는 대신
 * 채점 기록을 직접 심어 그 구간을 건너뛴다. 코퍼스에 없는 숙어 id 라
 * 카드 선택에는 안 끼어들고 건수만 채운다.
 */
async function seedReadings(page: Page, n: number): Promise<void> {
  await page.evaluate(
    (count) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let i = 0; i < count; i++) {
            store.put({
              id: `seed-${i}`, userId: 'local', deviceId: 'seed', at: 1_700_000_000_000 + i,
              idiomId: `seed-${i}`, cardType: 'reading', mistakeType: null, deletedAt: null,
              type: 'review', grade: 3, answer: 'あ', expected: 'あ', correct: true, elapsedMs: 100,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('seed 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    n,
  )
}

/** IndexedDB 의 이벤트 건수 — 소개가 기록을 안 남기는지 보는 데 쓴다 */
async function eventCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readonly')
          const all = tx.objectStore('events').count()
          all.onsuccess = () => res(all.result)
          all.onerror = () => res(-1)
        }
        req.onerror = () => res(-1)
      }),
  )
}

/** 새 숙어는 "뜻은 알고 있었어요?" 를 먼저 묻는다 — 보여주기 전에 물어야 답이 의미가 있다 */
async function passClassReview(page: Page): Promise<void> {
  const ask = page.getByRole('button', { name: '몰랐다', exact: true })
  if (await ask.isVisible().catch(() => false)) await ask.click()
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
 * 소개는 문제 사이에 흩어져 나온다 (2026-09-14) — 첫 장이라는 보장이 없다.
 * 소개가 뜰 때까지 앞의 문제들을 풀어 넘긴다.
 */
async function advanceToIntro(page: Page, budget = 30): Promise<void> {
  const intro = page.locator('.intro-card')
  for (let i = 0; i < budget; i++) {
    await passClassReview(page)
    if (await intro.isVisible().catch(() => false)) return
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('あ')
      await page.getByRole('button', { name: '확인', exact: true }).click()
    } else {
      // 뜻 카드는 「뜻 보기」 를 눌러야 채점 버튼이 나온다
      const reveal = page.getByRole('button', { name: '뜻 보기', exact: true })
      if (await reveal.isVisible().catch(() => false)) await reveal.click()
      const dunno = page.getByRole('button', { name: '몰랐어요', exact: true })
      if (await dunno.isVisible().catch(() => false)) await dunno.click()
    }
    const next = page.getByRole('button', { name: '다음', exact: true })
    await next.click({ timeout: 5_000 }).catch(() => {})
    await page.waitForTimeout(80)
  }
  throw new Error('소개 카드를 못 만났다')
}

test('새 숙어는 소개로 나오고, 채점도 이벤트도 없다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedReadings(page, 30)

  // 기록이 쌓였으니 이제 새 숙어는 소개로 나온다 — 확인 질문 뒤에 소개가 와야 한다
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 })
  await advanceToIntro(page)
  const intro = page.locator('.intro-card')
  await expect(intro).toBeVisible({ timeout: 10_000 })

  // 소개는 한자어·읽기·뜻을 다 보여준다. 입력창은 없다
  await expect(intro.locator('.headword')).not.toBeEmpty()
  // 읽기는 한자 위 요미가나로 얹힌다
  await expect(intro.locator('rt').first()).not.toBeEmpty()
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(intro.getByRole('button', { name: '봤어요' })).toBeVisible()

  const first = await intro.locator('.headword').innerText()

  // 「봤어요」 는 이벤트를 안 남긴다 — 채점도 FSRS 도 안 건드린다
  const before = await eventCount(page)
  expect(before).toBeGreaterThanOrEqual(0)
  await intro.getByRole('button', { name: '봤어요' }).click()
  await page.waitForTimeout(150)
  expect(await eventCount(page)).toBe(before)

  // 같은 숙어는 이번 세션에서 다시 안 나온다. 소개는 문제 사이에 흩어져 있어
  // (2026-09-14) 다음 소개까지는 문제를 풀어 넘겨야 한다
  const seen = new Set<string>([first])
  for (let i = 0; i < 2; i++) {
    try {
      await advanceToIntro(page)
    } catch {
      break // 이번 세션에 소개가 더 없다
    }
    const h = await intro.locator('.headword').innerText()
    expect(seen.has(h)).toBe(false)
    seen.add(h)
    await intro.getByRole('button', { name: '봤어요' }).click()
    await page.waitForTimeout(80)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test('안다고 답하면 소개를 건너뛰고 바로 읽기로 간다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedReadings(page, 30)

  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 })

  // 확인 질문이 나올 때까지 (첫 카드가 바로 질문이다)
  const known = page.getByRole('button', { name: '알고 있었다', exact: true })
  await expect(known).toBeVisible({ timeout: 10_000 })
  await known.click()

  // 아는 단어를 가르치지 않는다 — 소개 없이 입력창이 열린다
  await expect(page.locator('.intro-card')).toHaveCount(0)
  await expect(page.locator('.kana-input')).toBeVisible({ timeout: 10_000 })
})

test('모른다고 답해야 소개가 뜬다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await seedReadings(page, 30)

  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 })
  // advanceToIntro 는 확인 질문마다 「몰랐다」 를 고른다 — 그래서 소개까지 간다
  await advanceToIntro(page)

  const intro = page.locator('.intro-card')
  await expect(intro).toBeVisible()
  // 모른다고 한 뒤라 보여주는 게 정당하다 — 읽기·뜻이 다 나온다
  await expect(intro.locator('rt').first()).not.toBeEmpty()
  await expect(page.locator('.kana-input')).toHaveCount(0)
})

test('기록이 없으면 소개 없이 바로 문제부터 — 레벨 테스트 구간', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.card').first()).toBeVisible({ timeout: 10_000 })

  // 확인 질문에 모른다고 답해도 설명이 안 뜬다 — 아직 이 사람을 모른다
  const unknown = page.getByRole('button', { name: '몰랐다', exact: true })
  if (await unknown.isVisible().catch(() => false)) await unknown.click()

  await expect(page.locator('.intro-card')).toHaveCount(0)
  await expect(page.locator('.kana-input')).toBeVisible({ timeout: 10_000 })
})
