// 확인 단계 TTS — 문제 풀이 화면에는 없고, 피드백에서만 ja-JP 로 발화하는지 실브라우저에서 확인
import { expect, test } from '@playwright/test'

test('소리 듣기는 확인 단계에만 있고 ja-JP 로 발화한다', async ({ page }) => {
  // speechSynthesis.speak 을 가로채 호출 인자를 기록한다 (실제 오디오 재생 여부는 검증 대상이 아니다)
  await page.addInitScript(() => {
    ;(window as unknown as { __ttsCalls: { text: string; lang: string }[] }).__ttsCalls = []
    const synth = window.speechSynthesis
    synth.speak = (u: SpeechSynthesisUtterance) => {
      ;(window as unknown as { __ttsCalls: { text: string; lang: string }[] }).__ttsCalls.push({
        text: u.text,
        lang: u.lang,
      })
    }
  })

  await page.goto('/')
  const start = page.getByRole('button', { name: '세션 시작' })
  await expect(start).toBeEnabled({ timeout: 20_000 })
  await start.click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  // 지연 검수 프롬프트가 뜨면 넘긴다 — 순수 문제 풀이 화면(읽기 카드)에 닿을 때까지
  const classReview = page.getByRole('button', { name: '알고 있었다' })
  if (await classReview.isVisible().catch(() => false)) await classReview.click()

  const input = page.locator('.kana-input')
  await expect(input).toBeVisible({ timeout: 10_000 })

  // 문제 풀이 화면 — 소리 듣기가 없어야 한다
  await expect(page.getByRole('button', { name: /소리 듣기/ })).toHaveCount(0)

  const reading = page.locator('.reading-shown')
  await input.fill('aaa') // 오답이어도 상관없다 — 확인 단계 진입만 보면 된다
  await page.getByRole('button', { name: '확인' }).click()
  await expect(reading).toBeVisible()

  // 확인 단계 — 소리 듣기가 나타난다
  const soundBtn = page.getByRole('button', { name: /소리 듣기/ })
  await expect(soundBtn).toBeVisible()
  await soundBtn.click()

  const calls = await page.evaluate(
    () => (window as unknown as { __ttsCalls: { text: string; lang: string }[] }).__ttsCalls,
  )
  expect(calls.length).toBeGreaterThanOrEqual(1)
  expect(calls[0].lang).toBe('ja-JP')
  expect(calls[0].text.length).toBeGreaterThan(0)
})
