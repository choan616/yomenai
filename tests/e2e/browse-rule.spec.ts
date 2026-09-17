// 다시보기 규칙 배지 검증 (사용자 요청 2026-09-17) — 「N회 틀림」 옆에 그 숙어를 틀린 규칙이
// 붙고, 누르면 그 절이 카드 안에서 펼쳐진다.
//
// 반탁 오답을 심는다. 저장된 유형은 RENDAKU 하나뿐이라, 배지가 「반탁」으로 뜨면
// 갈래를 답으로 다시 매기는 길(voicingByEvent)이 화면까지 이어진 것이다.
import { expect, test } from '@playwright/test'

/** 心配 しんぱい 를 しんはい 로 — 반탁 자리 (src/core/mistakes.test.ts 와 같은 케이스) */
const SHINPAI = '1360930'

test('다시보기 배지가 그 숙어를 틀린 규칙을 가리킨다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    (idiomId) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let i = 0; i < 2; i++) {
            store.put({
              id: `0000001${i}-rule`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType: 'RENDAKU',
              deletedAt: null,
              type: 'review',
              grade: 1,
              answer: 'しんはい',
              expected: 'しんぱい',
              correct: false,
              elapsedMs: 1000,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    SHINPAI,
  )
  await page.reload()

  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  const slide = page.locator('.browse-slide').filter({ hasText: '心配' })
  await expect(slide).toHaveCount(1, { timeout: 20_000 })

  // 「2회 틀림」 과 같은 줄, 같은 배지 무게로
  const head = slide.locator('.card-head')
  await expect(head).toContainText('2회 틀림')
  const badge = head.locator('.rule-tag')
  await expect(badge).toHaveText('반탁 규칙')
  await expect(badge).not.toContainText('연탁')

  // 펼치기 전에는 절이 없다 — 카드는 채점 없이 보는 자리다
  await expect(slide.locator('.browse-rule')).toHaveCount(0)
  await expect(badge).toHaveAttribute('aria-expanded', 'false')

  // 누르면 그 절이 카드 안에서 열린다. 규칙 화면으로 나가지 않는다 (넘기던 자리를 잃는다)
  await badge.click()
  const panel = slide.locator('.browse-rule')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('ぱ행')
  await expect(panel.locator('.rule-examples > li').first()).not.toBeEmpty()
  await expect(page.locator('.browse-track')).toBeVisible()

  // 규칙은 카드 **맨 아래**다. 예문과 「다음 예문」 사이에 끼면 버튼이 제 예문에서 떨어진다
  // (사용자 지적 2026-09-17)
  await expect(slide.locator('.card-body > *').last()).toHaveClass(/browse-rule/)

  // 규칙 본문의 일본어에는 lang="ja" 가 붙는다 (CLAUDE.md 자형 규칙)
  const inline = panel.locator('.rule-para [lang="ja"]').first()
  await expect(inline).toBeVisible()
  expect(await inline.evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Noto Sans JP')

  // 다시 누르면 접힌다
  await badge.click()
  await expect(slide.locator('.browse-rule')).toHaveCount(0)
})
