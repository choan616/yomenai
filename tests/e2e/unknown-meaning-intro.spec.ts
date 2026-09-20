// 「뜻을 몰랐다」를 고르면 그 표현은 문제가 아니라 소개로 간다 (2026-09-20 사용자 보고).
//
// planIntros 는 빌드 시점에 소개를 고르는데 상한(문제의 1/3)과 누적 읽기 30회 문턱이 있어서,
// 초반이나 신규가 많은 세션에서는 새 표현이 그냥 출제된다. 그런데 **사용자가 직접 모른다고
// 말한 것**은 그 추정보다 강한 신호다 — 모른다고 답한 직후에 시험하면 「첫 만남을 시험이
// 아니라 소개로」(2026-09-13) 가 깨진다.
import { expect, test } from '@playwright/test'

test('뜻을 몰랐다고 답하면 바로 시험하지 않고 소개를 보여준다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  // 기록을 비워 신규 표현만 나오게 한다 — 누적 읽기가 30회 미만이라 planIntros 는 소개를 안 고른다
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
  await page.getByRole('button', { name: '세션 시작' }).click()

  const ask = page.getByRole('button', { name: '몰랐다', exact: true })
  await expect(ask).toBeVisible({ timeout: 15_000 })
  const kanjiOf = async () =>
    (await page.locator('.headword').first().innerText()).replace(/[^一-鿿]/g, '')
  const headword = await kanjiOf()
  await ask.click()

  // 소개 카드 — 「봤어요」가 있고 입력창은 없다
  await expect(page.getByRole('button', { name: '봤어요', exact: true })).toBeVisible()
  await expect(page.locator('.kana-input')).toHaveCount(0)
  // 같은 표현을 소개한다 (다음 카드로 넘어가 버린 게 아니다). 소개는 루비가 붙어
  // innerText 에 읽기가 섞이므로 한자만 견준다
  expect(await kanjiOf()).toBe(headword)

  // 보고 넘기면 같은 표현을 이번 세션에서 다시 묻지 않는다
  await page.getByRole('button', { name: '봤어요', exact: true }).click()
  await page.waitForTimeout(300)
  const after = await kanjiOf()
  expect(after).not.toBe(headword)
})
