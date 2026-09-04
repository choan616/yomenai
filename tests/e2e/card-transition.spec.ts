// 카드 전환 150ms 이하 실측 (PLAN §7). 실브라우저에서 세션을 끝까지 돌리며 전환 시간을 모은다
import { expect, test } from '@playwright/test'

/** 화면에 보이면 클릭. 안 보이면 false */
async function clickIfVisible(page: import('@playwright/test').Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click()
    return true
  }
  return false
}

test('카드 전환이 150ms 이하다', async ({ page }) => {
  await page.goto('/')

  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()

  // 카드가 나올 때까지
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  for (let i = 0; i < 60; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break

    // 지연 검수 → 답 단계로 (전환)
    if (await clickIfVisible(page, '알고 있었다')) continue

    // 읽기 입력 → 오답 제출 (피드백 표시, 아직 전환 아님)
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('aaa')
      await clickIfVisible(page, '확인')
      continue
    }

    // 뜻 카드 — 뜻 보기 → 알았어요 (자동 전환)
    if (await clickIfVisible(page, '뜻 보기')) continue
    if (await clickIfVisible(page, '알았어요')) continue

    // 피드백 → 다음 (전환)
    if (await clickIfVisible(page, '다음')) continue

    break
  }

  const durations: number[] = await page.evaluate(() =>
    performance.getEntriesByName('yomenai:transition').map((m) => m.duration),
  )

  console.log(
    `전환 ${durations.length}회 · 최소 ${Math.min(...durations).toFixed(1)} · ` +
      `중앙값 ${median(durations).toFixed(1)} · p95 ${percentile(durations, 95).toFixed(1)} · ` +
      `최대 ${Math.max(...durations).toFixed(1)} (ms)`,
  )

  expect(durations.length).toBeGreaterThanOrEqual(10)
  expect(percentile(durations, 95)).toBeLessThanOrEqual(150)
})

function median(xs: number[]): number {
  return percentile(xs, 50)
}
function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
