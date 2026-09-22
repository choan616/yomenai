// 훈독 트랙 분리 (2026-09-22). 홈의 「훈독 숙어」 진입로가 훈독만 내고,
// 기본 세션에는 훈독이 안 섞이는지 실제 화면에서 본다.
// 단위 테스트(`src/dict/track.test.ts`)가 푸울을 보는 것과 달리 여기선 **그려진 카드**를 본다.
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
      // 진단 분기의 홈은 진단·세션 시작 둘만 낸다. 훈독 진입로는 그 뒤 화면에 있다
      localStorage.setItem('yomenai:diagnosticDone', '1')
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

/** 배포된 번들에서 표기 → 갈래. 화면이 읽는 것과 같은 파일이라야 검사가 뜻이 있다 */
async function readingKinds(page: Page): Promise<Record<string, string>> {
  return page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const { idioms } = (await res.json()) as { idioms: { headword: string; readingKind: string }[] }
    const map: Record<string, string> = {}
    for (const i of idioms) map[i.headword] ??= i.readingKind
    return map
  })
}

/** 지금 장의 표기. 요미가나가 붙은 장은 innerText 에 rt 가 섞이므로 표기만 남긴다 */
async function headwordNow(page: Page): Promise<string> {
  return page.locator('.headword').first().evaluate((el) => {
    const clone = el.cloneNode(true) as HTMLElement
    clone.querySelectorAll('rt').forEach((rt) => rt.remove())
    return (clone.textContent ?? '').trim()
  })
}

/** 세션을 돌며 만난 표기를 모은다. 채점은 아무렇게나 — 무엇이 나오는지만 본다 */
async function collectHeadwords(page: Page, rounds: number): Promise<string[]> {
  const heads: string[] = []
  for (let i = 0; i < rounds; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    if (await page.locator('.headword').first().isVisible().catch(() => false)) {
      const h = await headwordNow(page)
      if (h && heads[heads.length - 1] !== h) heads.push(h)
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
  return heads
}

test.describe('훈독 트랙', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await resetState(page)
    await clickIfVisible(page, '알겠어요')
  })

  test('「훈독 숙어」 세션에는 훈독만 나온다', async ({ page }) => {
    const kinds = await readingKinds(page)
    const entry = page.getByRole('button', { name: /훈독 숙어/ })
    await expect(entry).toBeVisible({ timeout: 15_000 })
    await entry.click()

    const heads = await collectHeadwords(page, 60)
    expect(heads.length).toBeGreaterThan(0)
    // 사전에 없는 표기는 검사에서 제외한다 — 화면 문구가 섞여 들어오는 것을 막는다
    const known = heads.filter((h) => kinds[h] !== undefined)
    expect(known.length).toBeGreaterThan(0)
    expect(known.filter((h) => kinds[h] !== 'kun')).toEqual([])
  })

  test('기본 세션에는 훈독이 안 섞인다', async ({ page }) => {
    const kinds = await readingKinds(page)
    const start = page.getByRole('button', { name: '세션 시작', exact: true })
    await expect(start).toBeVisible({ timeout: 15_000 })
    await start.click()

    const heads = await collectHeadwords(page, 80)
    expect(heads.length).toBeGreaterThan(0)
    const known = heads.filter((h) => kinds[h] !== undefined)
    expect(known.filter((h) => kinds[h] === 'kun')).toEqual([])
  })
})
