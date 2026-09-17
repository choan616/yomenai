// 읽기 규칙 화면 검증 — 절이 접혀 있다가 펼쳐지고, 예시·대조가 뜨고, 기록이 없으면 그렇게 말한다 (2026-09-17).
// 읽을거리가 아니라 색인이라는 게 이 화면의 정체라, 기록 자리가 있는지까지 본다.
import { expect, test } from '@playwright/test'

test('홈에서 읽기 규칙을 열고 절을 펼친다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '읽기 규칙' })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: '읽기 규칙' }).click()

  await expect(page.getByRole('heading', { name: '읽기 규칙' })).toBeVisible()

  // 여덟 절이 접힌 채로 — 다 펼쳐져 있으면 지도가 아니라 벽이다
  const blocks = page.locator('.rule-block')
  await expect(blocks).toHaveCount(8)
  await expect(page.locator('.rule-open')).toHaveCount(0)

  // 맨 앞은 한국 한자음 대응. 나머지 규칙이 여기서 갈린다
  const first = blocks.first()
  await expect(first).toContainText('한국 한자음이 음독의 꼬리를 정한다')
  await first.locator('.rule-head').click()

  const open = first.locator('.rule-open')
  await expect(open).toBeVisible()
  await expect(open).toContainText('ㄱ 받침은')
  // 예시는 표기와 읽기가 같이 — 일본어는 lang="ja" 로 (CLAUDE.md 자형 규칙)
  const example = open.locator('.rule-examples > li').first()
  await expect(example.locator('.rule-word')).toHaveAttribute('lang', 'ja')
  await expect(example).toContainText('特徴')

  // 대조 — 걸린 것과 안 걸린 것이 나란히
  await expect(open.locator('.rule-contrast').first()).toContainText('目的')

  // 한국어 문장에 섞인 일본어에도 lang="ja" 가 붙는다.
  // 안 붙으면 한중일 통합 코드포인트가 한국 자형으로 그려져 틀린 글자 모양을 학습한다
  const inline = open.locator('.rule-para [lang="ja"]').filter({ hasText: '学' }).first()
  await expect(inline).toBeVisible()
  const font = await inline.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(font).toContain('Noto Sans JP')

  // 기록이 없는 새 기기라면 그렇게 말한다 (있으면 횟수가 뜬다)
  await expect(open.locator('.rule-record')).toBeVisible()

  // 한 번에 한 절만 열린다
  await blocks.nth(1).locator('.rule-head').click()
  await expect(page.locator('.rule-open')).toHaveCount(1)
  await expect(blocks.nth(1).locator('.rule-open')).toContainText('촉음')

  // 연탁 절이 라이먼의 법칙과 대등 합성을 다 짚는다 — 사용자가 물은 자리다
  const rendaku = blocks.filter({ hasText: '연탁' }).first()
  await rendaku.locator('.rule-head').click()
  await expect(rendaku.locator('.rule-open')).toContainText('라이먼')
  await expect(rendaku.locator('.rule-contrast').first()).toContainText('春風')

  // 나가면 홈
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.getByRole('button', { name: '읽기 규칙' })).toBeVisible()
})
