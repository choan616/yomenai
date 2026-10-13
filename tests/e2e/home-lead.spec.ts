// 홈이 내민 표기가 세션의 첫 장이 된다 (2026-10-13) — 미끼와 첫 카드가 어긋나면 유도가 거짓이다
import { expect, test, type Page } from '@playwright/test'
import { gradings, putGradings } from './level-seed.js'

test.setTimeout(120_000)

async function resetState(page: Page): Promise<void> {
  await page.evaluate(() => {
    try {
      localStorage.clear()
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
    return new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
}

test('주 동작이 표기를 내밀고, 누르면 그 표기가 첫 장으로 나온다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  // 열려 있는 연결이 지우기를 막으므로 한 번 새로 띄운 뒤 심는다 (intro-new-card 와 같은 순서)
  await page.reload()
  // 30일 전 채점이면 복습 기한이 지나 `due` 가 된다 — 내밀 카드의 조건이다.
  // 세션 상한보다 많이 심는다. 자르기와의 순서는 셔플에 달려 여기서 못 고정하므로
  // `homeCard.test.ts` 의 「당기기와 소개 배치의 순서」가 그 몫을 맡는다
  await putGradings(page, gradings(0, 30, 30, 30), 'lead')
  await page.reload()

  const face = page.locator('.lead-face')
  await expect(face).toBeVisible({ timeout: 20_000 })
  const word = face.locator('.lead-word')
  // 일본어 자형으로 렌더링돼야 한다 (CLAUDE.md)
  await expect(word).toHaveAttribute('lang', 'ja')
  const lead = (await word.innerText()).trim()
  expect(lead).not.toBe('')
  // 표기가 위, 묻는 말이 아래다 (2026-10-13 사용자 지적 — 위에 두면 띠 문구와 붙어 보인다)
  const wordBox = (await word.boundingBox())!
  const askBox = (await face.locator('.lead-ask').boundingBox())!
  expect(wordBox.y).toBeLessThan(askBox.y)
  // 읽기는 홈에 안 보인다 — 보여주면 그 숙어의 회상 기회를 공짜로 쓴다
  await expect(face).toHaveText(`${lead}이 표현, 읽을 수 있어요?세션 시작`)
  // 주 동작은 면 안에 선다 (2026-10-13 2차 시안). 면 안에 버튼은 그것 하나뿐이다
  const start = face.getByRole('button', { name: '세션 시작' })
  await expect(face.getByRole('button')).toHaveCount(1)
  await expect(start).toBeEnabled()
  // 둥근 면 안이라 버튼 모서리가 면보다 덜 둥글다 (사용자 지적)
  const r = (el: typeof face) => el.evaluate((e) => parseFloat(getComputedStyle(e).borderTopLeftRadius))
  expect(await r(start)).toBeLessThan(await r(face))
  // 표기가 상단 로고(700)보다 얇다 — 같은 굵기면 둘이 같은 무게로 선다
  const weight = (el: typeof face) => el.evaluate((e) => Number(getComputedStyle(e).fontWeight))
  expect(await weight(word)).toBeLessThan(await weight(page.locator('.home h1')))

  await start.click()
  const card = page.locator('.card').first()
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card.locator('.headword')).toHaveText(lead)
  // 첫 장은 문제다 — 입력창이 있고 소개 카드가 앞을 가로채지 않는다
  await expect(page.locator('.kana-input')).toBeVisible()
})

test('내밀 카드가 없으면 면이 아예 없다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await page.reload()

  // 기록이 없으면 전부 신규라 `due` 카드가 없다 — 내밀 표기가 없다
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await expect(start).toHaveText('세션 시작')
  await expect(page.locator('.lead-face')).toHaveCount(0)
  // 면이 없으면 주 동작은 큰 버튼(56px)으로 혼자 선다 — 면 안에서는 40px 다
  expect((await start.boundingBox())?.height).toBe(56)
})

test('세션에서 푼 표기는 돌아온 홈에 다시 안 선다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await page.reload()
  await putGradings(page, gradings(0, 30, 30, 30), 'again')
  await page.reload()

  const word = page.locator('.lead-face .lead-word')
  await expect(word).toBeVisible({ timeout: 20_000 })
  const first = (await word.innerText()).trim()

  await page.getByRole('button', { name: '세션 시작' }).click()
  const card = page.locator('.card').first()
  await expect(card.locator('.headword')).toHaveText(first, { timeout: 20_000 })

  // 한 장만 풀고 나온다. 입력은 채운 값이 남은 것을 보고 보낸다 (ja-lang 과 같은 이유)
  const input = page.locator('.kana-input')
  await expect(input).toBeVisible()
  await expect(async () => {
    await input.fill('xxxxx')
    await expect(input).toHaveValue(/.+/)
  }).toPass({ timeout: 10_000 })
  await input.press('Enter')
  await expect(page.locator('.card.feedback')).toBeVisible({ timeout: 20_000 })
  // 「다음」이 채점을 기록한다 — 피드백에서 바로 나가면 이벤트가 안 남는다
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.card.feedback')).toHaveCount(0)
  await page.getByRole('button', { name: '세션 나가기' }).click()

  // 돌아온 홈 — 방금 푼 표기는 안 선다. 틀렸어도(10분 뒤 기한) 오늘 본 표기라 빠진다
  await expect(page.locator('.home h1')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.lead-face .lead-word')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.lead-face .lead-word')).not.toHaveText(first)
})

/**
 * 사용자가 보고한 그 길이다 (2026-10-13 「표현이 두 개였던 것 중 하나가 틀렸다. 그것이 다시 나왔다」).
 *
 * 「읽기 둘」 카드는 쓰지 못한 쪽을 **무기록**으로 둔다(`homograph-dual.spec.ts`). 그 숙어의 기한은
 * 세션 전 그대로라, 고치기 전에는 돌아온 홈에서 같은 표기가 다시 맨 앞에 섰다.
 * 代替 는 だいたい·だいがわり 가 한 표기를 나눠 쓴다.
 */
test('「읽기 둘」에서 한쪽만 쓰고 넘겨도 그 표기는 다시 안 선다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)
  await page.reload()
  // 기한이 지난 카드를 代替 둘만 둔다 — 그래야 미끼가 반드시 代替 고, 세션 뒤에
  // 「무기록으로 남은 だいたい」가 미끼로 다시 서는지를 가릴 수 있다
  await putGradings(
    page,
    [
      { idiomId: '1581470', daysAgo: 60, ok: true },
      { idiomId: '1824770', daysAgo: 60, ok: true },
    ],
    'dual',
  )
  await page.reload()

  const word = page.locator('.lead-face .lead-word')
  await expect(word).toHaveText('代替', { timeout: 20_000 })

  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toHaveText('代替', { timeout: 20_000 })
  await expect(page.locator('.dual-slot')).toHaveCount(2)

  // 한쪽만 쓰고 나머지는 넘긴다 — 넘긴 쪽은 기록이 안 남는다
  const input = page.locator('.kana-input')
  await expect(async () => {
    await input.fill('daigawari')
    await expect(input).toHaveValue(/.+/)
  }).toPass({ timeout: 10_000 })
  await input.press('Enter')
  await page.getByRole('button', { name: 'SKIP', exact: true }).click()
  await expect(page.locator('.card.feedback')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await expect(page.locator('.card.feedback')).toHaveCount(0)
  await page.getByRole('button', { name: '세션 나가기' }).click()

  // 돌아온 홈 — 기록이 없는 だいたい 는 아직 기한이 지난 채 남아 있다. 오늘 본 표기라 안 내밀고,
  // 다른 기한 카드가 없으니 면이 통째로 사라진다 (고치기 전에는 여기서 代替 가 다시 섰다)
  await expect(page.locator('.home h1')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.week-strip:not(.slot)')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.lead-face')).toHaveCount(0)
})
