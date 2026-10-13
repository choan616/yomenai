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
  // 면이 없으면 주 동작은 큰 버튼(56px)으로 혼자 선다 — 면 안에서는 48px 다
  expect((await start.boundingBox())?.height).toBe(56)
})
