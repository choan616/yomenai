// 찾기에서 담아 두기 (2026-09-21 사용자 요청) — 담은 표현이 다음 세션에 실제로 나오는지까지 본다.
//
// 대상은 **밴드 0** 인 明白(めいはく)다. 밴드 0 은 신규 도입에서 빠지므로(`minBand` 기본 1)
// 담지 않으면 세션에 절대 안 나온다 — 담기가 밴드 제한을 면제하는지를 이 한 건이 가른다.
import { expect, test, type Page } from '@playwright/test'

const WORD = '明白'
const READING = 'めいはく'

async function fresh(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    try {
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
  await page.reload()
}

async function openSearch(page: Page): Promise<void> {
  const tab = page.getByRole('button', { name: '찾기', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()
}

test('담은 표현이 다음 세션에 나온다 — 밴드 0 이라 담지 않으면 안 나올 것', async ({ page }) => {
  await fresh(page)
  await openSearch(page)

  const input = page.getByLabel('읽기 검색')
  await input.fill(READING)
  const row = page.locator('.rows > li').filter({ hasText: WORD }).first()
  await expect(row).toBeVisible()

  // 담기 — 기호가 + 에서 − 로 바뀐다 (색만으로 구분하지 않는다)
  const star = row.getByRole('button', { name: `${WORD} 담기` })
  await expect(star).toHaveText('+')
  await star.click()
  await expect(row.getByRole('button', { name: `${WORD} 빼기` })).toHaveText('−')

  // 검색어를 지우면 담아 둔 목록이 보인다
  await input.fill('')
  await expect(page.locator('.basket')).toContainText(WORD)

  // 새로고침해도 남는다 — 이벤트가 IndexedDB 에 들어갔다는 뜻이다
  await page.reload()
  await openSearch(page)
  await expect(page.locator('.basket')).toContainText(WORD)

  // 세션을 돌며 실제로 만나는지 본다
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await page.getByRole('button', { name: '세션 시작' }).click()

  let met = false
  // 카드 한 장에 최대 세 번 눌린다(확인 질문 → 뜻 보기 → 채점). 20장이면 넉넉히 120회
  for (let i = 0; i < 120 && !met; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    // **카드가 뜰 때까지 기다린 뒤** 읽는다. 전환 중(150ms 목표)에 넘겨짚으면
    // 그 한 장을 못 읽고 지나쳐, 담긴 카드가 나왔는데도 못 봤다고 실패한다
    const head = page.locator('.headword').first()
    await head.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})
    const text = await head.textContent().catch(() => null)
    if ((text ?? '').includes(WORD)) met = true
    // 무엇이 떠 있든 한 장 넘긴다. **뜻 카드는 「뜻 보기」를 먼저 눌러야 채점 버튼이 나온다**
    for (const name of ['봤어요', '알고 있었다', '뜻 보기', '알았어요', 'SKIP', '다음']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) {
        await b.click().catch(() => {})
        break
      }
    }
    await page.waitForTimeout(60)
  }
  expect(met, `${WORD} 가 세션에 나와야 한다`).toBe(true)
})

test('빼면 목록에서 사라진다', async ({ page }) => {
  await fresh(page)
  await openSearch(page)

  const input = page.getByLabel('읽기 검색')
  await input.fill(READING)
  const row = page.locator('.rows > li').filter({ hasText: WORD }).first()
  await row.getByRole('button', { name: `${WORD} 담기` }).click()
  await row.getByRole('button', { name: `${WORD} 빼기` }).click()

  await input.fill('')
  await expect(page.locator('.basket')).toHaveCount(0)
})
