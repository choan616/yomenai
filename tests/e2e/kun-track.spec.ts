// 훈독 숙어 비율 (2026-09-22). 설정 레인지가 실제 출제를 바꾸는지 그려진 화면에서 본다.
// 비율 자체는 단위 테스트(`src/dict/track.test.ts`)가 고정 시드로 못 박는다 — 여기선
// **레인지 UI 가 값을 바꾸고 저장하는가** 와 **0%/100% 양끝이 화면에 그대로 나오는가** 다.
//
// 홈에는 진입로를 두지 않는다 — 훈독은 갈래가 아니라 **비율**이라서 설정에만 있다 (사용자 판단).
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

async function resetState(page: Page, kunPercent: number): Promise<void> {
  await page.evaluate((kun) => {
    try {
      localStorage.clear()
      // 진단 분기의 홈은 진단·세션 시작 둘만 낸다
      localStorage.setItem('yomenai:diagnosticDone', '1')
      // 세션 길이를 키워 한 세션에서 충분히 많은 표기를 만난다
      localStorage.setItem('yomenai:settings', JSON.stringify({ sessionLimit: 40, kunPercent: kun }))
    } catch {
      /* private mode */
    }
    return new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  }, kunPercent)
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
    // 뜻 카드 — 가려 두고 「뜻 보기」로 연 다음 채점한다. 이걸 안 누르면 여기서 멈춘다
    if (await clickIfVisible(page, '뜻 보기')) {
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '알았어요')) {
      await page.waitForTimeout(20)
      continue
    }
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

/**
 * 한 세션을 끝까지 돈다. 40장 세션은 장당 2~3바퀴(답 → 채점 → 다음)라 넉넉히 준다 —
 * 모자라면 세션 도중에 빠져나와 다음 회차에서 「세션 시작」을 못 찾는다
 */
async function runAndCollect(page: Page): Promise<string[]> {
  const start = page.getByRole('button', { name: '세션 시작', exact: true })
  await expect(start).toBeVisible({ timeout: 15_000 })
  await start.click()
  return collectHeadwords(page, 300)
}

test('0% 에서는 훈독 숙어가 안 나온다', async ({ page }) => {
  await page.goto('/')
  await resetState(page, 0)
  await clickIfVisible(page, '알겠어요')
  const kinds = await readingKinds(page)

  const heads = await runAndCollect(page)
  expect(heads.length).toBeGreaterThan(0)
  // 사전에 없는 표기는 제외 — 화면 문구가 섞여 들어오는 것을 막는다
  const known = heads.filter((h) => kinds[h] !== undefined)
  expect(known.length).toBeGreaterThan(0)
  expect(known.filter((h) => kinds[h] === 'kun')).toEqual([])
})

test('홈에 훈독 전용 진입로를 두지 않는다', async ({ page }) => {
  await page.goto('/')
  await resetState(page, 0)
  await clickIfVisible(page, '알겠어요')
  await expect(page.getByRole('button', { name: '세션 시작', exact: true })).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('button', { name: /훈독/ })).toHaveCount(0)
})

test('100% 면 훈독만 나온다', async ({ page }) => {
  await page.goto('/')
  await resetState(page, 100)
  await clickIfVisible(page, '알겠어요')
  const kinds = await readingKinds(page)

  const heads = await runAndCollect(page)
  expect(heads.length).toBeGreaterThan(0)
  const known = heads.filter((h) => kinds[h] !== undefined)
  expect(known.length).toBeGreaterThan(0)
  // 양끝(0% / 100%)은 정원이 완전히 갈라 놓으므로 화면에서 결정론으로 확인된다.
  // 가운데 값(20·50·80%)의 오차는 고정 시드 단위 테스트가 잰다
  expect(known.filter((h) => kinds[h] !== 'kun')).toEqual([])
})

test('레인지를 움직이면 값이 바뀌고 저장된다', async ({ page }) => {
  await page.goto('/')
  await resetState(page, 0)
  await clickIfVisible(page, '알겠어요')

  await page.getByRole('button', { name: '설정' }).click()
  const slider = page.locator('#kun-share')
  await expect(slider).toBeVisible({ timeout: 10_000 })
  await expect(slider).toHaveValue('0')

  await slider.fill('50')
  await expect(page.locator('.slider .val')).toHaveText('50%')
  expect(
    JSON.parse((await page.evaluate(() => localStorage.getItem('yomenai:settings'))) ?? '{}')
      .kunPercent,
  ).toBe(50)

  // 홈으로 돌아와도 세션이 그대로 선다 — 비율이 섞여도 정원 때문에 길이는 안 줄어든다
  await page.getByRole('button', { name: '홈' }).click()
  const heads = await runAndCollect(page)
  expect(heads.length).toBeGreaterThan(0)
})
