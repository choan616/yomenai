// 뜻 평가 엄지 (2026-09-22). 뜻 카드에서 누르면 기록되고, 피드백 화면이 그 목록을
// 보내는 내용에 얹는지 본다.
//
// 엄지는 **검수가 끝나도 안 없어진다** — 쓰는 동안 계속 열려 있는 창구다 (사용자 판단).
// 그래서 「미검수일 때만 뜬다」 같은 조건은 검사하지 않는다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(240_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

async function resetState(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear()
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:settings', JSON.stringify({ sessionLimit: 40 }))
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

/** 세션을 돌다가 뜻 카드를 만나면 멈춘다. 없으면 null */
async function reachMeaningCard(page: Page): Promise<string | null> {
  await page.getByRole('button', { name: '세션 시작', exact: true }).click()
  for (let i = 0; i < 300; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) return null
    // 뜻을 연 상태여야 엄지가 뜬다
    const thumb = page.getByRole('button', { name: '뜻이 이상해요' })
    if (await thumb.isVisible().catch(() => false)) {
      return page.locator('.meaning').first().innerText()
    }
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '뜻 보기')) {
      await page.waitForTimeout(40)
      continue
    }
    if (await clickIfVisible(page, '봤어요')) {
      await page.waitForTimeout(40)
      continue
    }
    if (await clickIfVisible(page, '알고 있었다')) continue
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('aaa')
      await input.press('Enter')
      await page.waitForTimeout(40)
      continue
    }
    await page.waitForTimeout(60)
  }
  return null
}

/** 로그에 남은 평가 이벤트 (취소분 포함, 원본 그대로) */
async function voteEvents(
  page: Page,
): Promise<{ verdict: string | null; headword: string; definition: string }[]> {
  return page.evaluate(
    () =>
      new Promise((res, rej) => {
        const open = indexedDB.open('yomenai')
        open.onerror = () => rej(new Error('DB 열기 실패'))
        open.onsuccess = () => {
          const tx = open.result.transaction('events', 'readonly')
          const all = tx.objectStore('events').getAll()
          all.onsuccess = () =>
            res(
              (
                all.result as {
                  type: string
                  verdict: string | null
                  headword: string
                  definition: string
                }[]
              )
                .filter((e) => e.type === 'flag')
                .map(({ verdict, headword, definition }) => ({ verdict, headword, definition })),
            )
          all.onerror = () => rej(new Error('읽기 실패'))
        }
      }),
  )
}

test('엄지 아래를 누르면 기록되고, 다시 누르면 취소된다', async ({ page }) => {
  await page.goto('/')
  await resetState(page)
  await clickIfVisible(page, '알겠어요')

  const meaning = await reachMeaningCard(page)
  expect(meaning, '세션에서 뜻 카드를 못 만났다').not.toBeNull()

  const bad = page.getByRole('button', { name: '뜻이 이상해요' })
  await expect(bad).toHaveAttribute('aria-pressed', 'false')
  await bad.click()
  await expect(bad).toHaveAttribute('aria-pressed', 'true')

  const after = await voteEvents(page)
  expect(after).toHaveLength(1)
  expect(after[0].verdict).toBe('bad')
  expect(after[0].headword.length).toBeGreaterThan(0)
  expect(after[0].definition.length).toBeGreaterThan(0)

  // 취소는 지우지 않고 verdict: null 을 덧붙인다 — append-only 다
  await bad.click()
  await expect(bad).toHaveAttribute('aria-pressed', 'false')
  const undone = await voteEvents(page)
  expect(undone).toHaveLength(2)
  expect(undone[1].verdict).toBeNull()
})

test('반대 엄지를 누르면 덮어쓴다 — 둘이 동시에 눌리지 않는다', async ({ page }) => {
  await page.goto('/')
  await resetState(page)
  await clickIfVisible(page, '알겠어요')
  expect(await reachMeaningCard(page)).not.toBeNull()

  const ok = page.getByRole('button', { name: '뜻이 맞아요' })
  const bad = page.getByRole('button', { name: '뜻이 이상해요' })
  await bad.click()
  await ok.click()
  await expect(ok).toHaveAttribute('aria-pressed', 'true')
  await expect(bad).toHaveAttribute('aria-pressed', 'false')
  expect((await voteEvents(page)).at(-1)?.verdict).toBe('ok')
})

test('엄지 위를 누르면 「미검수」 꼬리표가 걷힌다', async ({ page }) => {
  await page.goto('/')
  await resetState(page)
  await clickIfVisible(page, '알겠어요')
  expect(await reachMeaningCard(page)).not.toBeNull()

  const tag = page.locator('.card-head .tag.muted', { hasText: '미검수' })
  // 미검수가 아닌 뜻이 걸릴 수도 있다 — 그때는 이 검사가 확인할 게 없다
  if (await tag.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: '뜻이 맞아요' }).click()
    await expect(tag).toHaveCount(0)
  }
})

test('평가는 카드를 넘기지 않는다 — 누르고 하던 대로 답한다', async ({ page }) => {
  await page.goto('/')
  await resetState(page)
  await clickIfVisible(page, '알겠어요')

  const meaning = await reachMeaningCard(page)
  expect(meaning).not.toBeNull()

  await page.getByRole('button', { name: '뜻이 이상해요' }).click()
  // 같은 뜻이 그대로 떠 있고, 채점 버튼도 그대로다
  expect(await page.locator('.meaning').first().innerText()).toBe(meaning)
  await expect(page.getByRole('button', { name: '알았어요' })).toBeVisible()
})

test('평가한 뜻이 피드백에 판정별로 실려 나간다', async ({ page }) => {
  await page.goto('/')
  await resetState(page)
  await clickIfVisible(page, '알겠어요')

  expect(await reachMeaningCard(page)).not.toBeNull()
  await page.getByRole('button', { name: '뜻이 이상해요' }).click()
  const voted = (await voteEvents(page))[0]

  await page.goto('/')
  await page.getByRole('button', { name: '설정' }).click()
  await page.getByRole('button', { name: /피드백/ }).click()

  const preview = page.locator('.fb-preview').first()
  await expect(preview).toBeVisible({ timeout: 10_000 })
  // 보내는 내용에 그대로 보인다 — 무엇이 나가는지 감추지 않는다
  await expect(preview).toContainText('이상하다고 본 뜻')
  await expect(preview).toContainText(voted.headword)
  await expect(preview).toContainText(voted.definition)
  // 안 누른 쪽 절은 아예 안 붙는다
  await expect(preview).not.toContainText('맞다고 본 뜻')
})
