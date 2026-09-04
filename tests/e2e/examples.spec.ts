// 확인 단계 예문(Tatoeba, 무번역) — 문제 풀이 화면엔 없고, 피드백에서 lang="ja" 로 나오는지 확인
import { expect, test } from '@playwright/test'

test('예문은 문제 풀이 화면엔 없고 확인 단계에서만 나온다', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  let sawExample = false

  for (let i = 0; i < 20; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break

    const classReview = page.getByRole('button', { name: '알고 있었다' })
    if (await classReview.isVisible().catch(() => false)) {
      await classReview.click()
      continue
    }

    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      // 문제 풀이 화면 — 예문이 있으면 답을 미리 알려주는 셈이라 있으면 안 된다
      await expect(page.locator('.example-sentence')).toHaveCount(0)

      await input.fill('aaa')
      await page.getByRole('button', { name: '확인' }).click()
      await expect(page.locator('.feedback')).toBeVisible()
      await page.waitForTimeout(400) // loadExamples() fetch

      const example = page.locator('.example-sentence')
      if (await example.count()) {
        sawExample = true
        await expect(example.first()).toHaveAttribute('lang', 'ja')
      }

      const next = page.getByRole('button', { name: '다음' })
      if (await next.isVisible().catch(() => false)) await next.click()
      continue
    }

    if (await page.getByRole('button', { name: '뜻 보기' }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: '뜻 보기' }).click()
      await page.getByRole('button', { name: '알았어요' }).click()
      continue
    }

    break
  }

  // 밴드 0~3 매칭 커버리지 66.6%(context-notes 2026-09-04) 라 20장 세션에서 못 볼 확률은 희박하다
  expect(sawExample).toBe(true)
})
