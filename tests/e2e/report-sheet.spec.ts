// 리포트 요약 타일 → 하단 시트, 처방 카드 줄, 더 보기 (2026-10-05) — 요약 먼저, 상세는 시트로
import { expect, test, type Page } from '@playwright/test'
import { closeSheet } from './report-sheets.js'

/** 어제까지 이어진 `days` 일, 하루 4개(그중 하나는 틀린 것: 음독 선택)를 심는다 */
async function seed(page: Page, days: number): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(
    (days) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let d = 1; d <= days; d++) {
            const at = new Date()
            at.setDate(at.getDate() - d)
            at.setHours(12, 0, 0, 0)
            for (let i = 0; i < 4; i++) {
              const wrong = i === 0
              store.put({
                id: `sheet-${d}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                at: at.getTime() + i,
                idiomId: '1000220',
                cardType: 'reading',
                mistakeType: wrong ? 'ONYOMI_CHOICE' : null,
                deletedAt: null,
                type: 'review',
                grade: wrong ? 1 : 3,
                answer: wrong ? 'x' : 'めいはく',
                expected: 'めいはく',
                correct: !wrong,
                elapsedMs: 1000,
              })
            }
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    days,
  )
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.summary .tile')).toHaveCount(4, { timeout: 20_000 })
}

test('요약 타일 넷이 첫 화면에 있고 값이 채워져 있다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seed(page, 5)
  const tiles = page.locator('.summary .tile')
  await expect(tiles.nth(0)).toContainText('수준')
  // 수준 타일에는 코스 아이콘이 이름 앞에 선다 — 장식이라 낭독에서는 숨기고, 이름은 글자로 남는다
  await expect(tiles.nth(0).locator('.tile-v svg.icon')).toBeVisible()
  await expect(tiles.nth(0).locator('.tile-v svg.icon')).toHaveAttribute('aria-hidden', 'true')
  await expect(tiles.nth(1).locator('.tile-v svg')).toHaveCount(0)
  await expect(tiles.nth(1)).toContainText('학습한 날')
  await expect(tiles.nth(1)).toContainText('5일째')
  await expect(tiles.nth(2)).toContainText('많이 틀린 유형')
  await expect(tiles.nth(3)).toContainText('취약 음독')
  // 같은 내용이 두 번 나오지 않는다 — 정답률 타일은 없고, 타일 넷이 서로 다른 시트를 연다 (2026-10-06)
  await expect(page.locator('.summary')).not.toContainText('전체 정답률')
  // 넷이 모두 첫 화면(스크롤 없이) 안에 든다
  for (let i = 0; i < 4; i++) {
    const b = (await tiles.nth(i).boundingBox())!
    expect(b.y + b.height).toBeLessThanOrEqual(844)
  }
})

test('타일을 누르면 상세가 하단 시트로 열리고 Esc 로 닫힌다', async ({ page }) => {
  await seed(page, 5)
  const dialog = page.getByRole('dialog')

  await page.locator('.summary .tile').nth(0).click()
  await expect(dialog).toHaveAccessibleName('수준')
  await expect(page.locator('.ladder')).toBeVisible()
  await closeSheet(page)

  await page.locator('.summary .tile').nth(1).click()
  await expect(dialog).toHaveAccessibleName('학습한 날')
  await expect(page.locator('.cal-grid')).toBeVisible() // 시트 안의 달력은 처음부터 열려 있다
  await closeSheet(page)

  await page.locator('.summary .tile').nth(2).click()
  await expect(dialog).toHaveAccessibleName('오답 유형')
  await expect(page.locator('.bars')).toBeVisible()
  // 다시보기 진입은 오답 유형 시트가 아니라 다시보기 시트에 있다 (2026-10-05)
  await expect(page.getByRole('button', { name: /무작위 다시보기/ })).toHaveCount(0)
  // 바깥(배경)을 눌러도 닫힌다
  await page.locator('.sheet-backdrop').click({ position: { x: 20, y: 40 } })
  await expect(dialog).toHaveCount(0)
})

test('더 보기 줄: 읽기 규칙·음독 맵은 화면으로, 취약 음독·다시보기는 시트로', async ({ page }) => {
  await seed(page, 5)
  const more = page.locator('.tools')
  await expect(more.locator('.section-title')).toHaveText('더 보기')
  await expect(more.getByRole('button', { name: /읽기 규칙/ })).toBeVisible()
  await expect(more.getByRole('button', { name: /음독 맵/ })).toBeVisible()

  await more.getByRole('button', { name: /^다시보기/ }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('다시보기')
  await expect(page.getByRole('button', { name: /무작위 다시보기/ })).toBeVisible()
  await expect(page.locator('.bars')).toHaveCount(0)
  await closeSheet(page)

  // 취약 음독은 요약 타일로 올라갔다 — 더 보기에는 같은 줄이 없다 (같은 시트의 입구가 둘이면 같은 내용이 두 번 나온다)
  await expect(more.getByRole('button', { name: /^취약 음독/ })).toHaveCount(0)
})

test('취약 음독 타일은 취약 음독 시트를 연다', async ({ page }) => {
  await seed(page, 5)
  await page.locator('.summary .tile').nth(3).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('취약 음독')
  // 취약 음독이 있으면 목록이, 없으면 없다는 말이 선다 — 빈 시트는 없다
  const rows = page.locator('.weak-onyomi .rows li')
  if ((await rows.count()) > 0) await expect(rows.first()).toBeVisible()
  else await expect(page.locator('.weak-onyomi .empty')).toBeVisible()
})

test('다음에 볼 것은 옆으로 미는 카드 줄이다 (스냅)', async ({ page }) => {
  await seed(page, 5)
  const list = page.locator('.rx-rail .rx-list')
  await expect(list).toBeVisible()
  expect(await list.evaluate((el) => getComputedStyle(el).scrollSnapType)).toContain('x')
  expect(await list.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('row')
})

test('다음에 볼 것 — 마우스 기기에서는 화살표로, 키보드로는 ←/→ 로 넘긴다', async ({ page }) => {
  // 읽기 30개 이상이어야 처방이 선다 — 8일 × 4 = 32개
  await seed(page, 8)
  const list = page.locator('.rx-rail .rx-list')
  await expect(list).toBeVisible()
  expect(await list.locator('> li').count()).toBeGreaterThanOrEqual(2)
  const prev = page.getByRole('button', { name: '이전 카드' })
  const next = page.getByRole('button', { name: '다음 카드' })
  // 처음에는 이전이 막혀 있다
  await expect(prev).toBeDisabled()
  await expect(next).toBeEnabled()
  await next.click()
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await expect(prev).toBeEnabled()
  await prev.click()
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeLessThan(5)
  await expect(prev).toBeDisabled()
  // 키보드: 줄에 포커스를 두고 →
  await list.focus()
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeGreaterThan(50)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(() => list.evaluate((el) => el.scrollLeft)).toBeLessThan(5)
})

test('다음에 볼 것 — 터치 기기에서는 화살표를 안 보인다', async ({ browser }) => {
  const ctx = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 780 } })
  const page = await ctx.newPage()
  await seed(page, 8)
  await expect(page.locator('.rx-rail .rx-list')).toBeVisible()
  // 점 줄(=카드가 둘 이상)은 있는데 화살표만 안 보인다
  await expect(page.locator('.rx-dots')).toBeVisible()
  await expect(page.locator('.rx-arrow')).toHaveCount(2)
  await expect(page.locator('.rx-arrow').first()).toBeHidden()
  await ctx.close()
})

test('수준 타일의 코스 이름은 오를수록 진하고, 가장 옅어도 큰 글자 대비를 넘는다 (밝은·어두운 테마)', async ({ page }) => {
  await seed(page, 5)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const contrasts = await page.evaluate(() => {
      const tile = document.querySelector('.summary .tile') as HTMLElement
      const v = tile.querySelector('.tile-v') as HTMLElement
      const rgb = (css: string): [number, number, number] => {
        const c = document.createElement('canvas').getContext('2d')!
        c.fillStyle = '#000'
        c.fillStyle = css
        c.fillRect(0, 0, 1, 1)
        const d = c.getImageData(0, 0, 1, 1).data
        return [d[0]!, d[1]!, d[2]!]
      }
      const lum = ([r, g, b]: [number, number, number]) => {
        const f = (x: number) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
      }
      const bg = lum(rgb(getComputedStyle(tile).backgroundColor))
      return [0, 1, 2, 3, 4].map((n) => {
        v.setAttribute('data-shade', String(n))
        const l = lum(rgb(getComputedStyle(v).color))
        return (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05)
      })
    })
    // 오를수록 진하다(바탕과의 대비가 커진다) — 정상(4)은 능선(3)과 같은 가장 진한 먹이다
    for (let i = 1; i <= 3; i++) expect(contrasts[i]!, `${scheme} ${i}`).toBeGreaterThan(contrasts[i - 1]!)
    expect(contrasts[4]).toBeCloseTo(contrasts[3]!, 1)
    // 가장 옅은 산책로도 큰 글자 기준(3:1)을 넘는다
    expect(contrasts[0]!, `${scheme} 산책로`).toBeGreaterThanOrEqual(3)
  }
})
