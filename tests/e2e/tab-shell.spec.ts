// 하단 탭 셸 검증 (2026-09-17) — 탭 이동, 세션에서 탭바가 사라지는지, **홈이 안 넘치는지**.
// 홈은 스크롤이 없는 화면이라 넘치면 그냥 잘린다. 이 앱에서 길이는 취향이 아니라 기능이다.
import { expect, test, type Page } from '@playwright/test'

/** 홈 콘텐츠가 제 영역을 넘는 양 (0 이하여야 한다) */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => {
    const home = document.querySelector('.home') as HTMLElement
    return Math.round(home.scrollHeight - home.getBoundingClientRect().height)
  })
}

/** 기록이 쌓인 상태 — 「틀렸던 것」 줄과 「3장만」 이 같이 뜨는, 홈이 가장 긴 상태다 */
async function seedWrong(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let i = 0; i < 3; i++) {
            store.put({
              id: `0000000${i}-seed`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId: String(1000220 + i),
              cardType: 'reading',
              mistakeType: 'RENDAKU',
              deletedAt: null,
              type: 'review',
              grade: 1,
              answer: 'まちがい',
              expected: 'めいはく',
              correct: false,
              elapsedMs: 1000,
            })
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
  )
  await page.reload()
}

test('홈은 첫 진입에도 기록이 쌓여도 안 넘친다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })

  // 첫 진입 — 안내 패널이 얹힌 가장 빡빡한 상태
  await expect(page.locator('.welcome')).toBeVisible()
  expect(await overflow(page)).toBeLessThanOrEqual(0)

  await seedWrong(page)
  await expect(page.locator('.wrong-group')).toBeVisible({ timeout: 20_000 })
  expect(await overflow(page)).toBeLessThanOrEqual(0)
})

test('탭 넷을 오가고, 세션에서는 탭바가 사라진다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.tabbar')).toBeVisible()

  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.getByRole('heading', { name: '진단 리포트' })).toBeVisible()
  // 도구 둘은 기록이 없어도 보인다 — 규칙은 처음 틀린 날 가장 필요하다
  await expect(page.locator('.tools')).toContainText('읽기 규칙')
  await expect(page.locator('.tools')).toContainText('음독 맵')

  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()

  // 탭 루트에는 「‹」 가 없다 — 돌아갈 자리가 탭바다
  await expect(page.getByRole('button', { name: '홈으로' })).toHaveCount(0)

  // 한 겹 들어갔다 나오면 자기 탭 루트로 (복귀 상태를 안 들고 다닌다)
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /음독 맵/ }).click()
  await expect(page.getByRole('heading', { name: '음독 맵' })).toBeVisible()
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '진단 리포트' })).toBeVisible()

  // 세션은 탭바를 덮는다 — 키보드가 올라오는 화면이라 하단이 비어 있어야 한다
  await page.getByRole('button', { name: '학습', exact: true }).click()
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.tabbar')).toHaveCount(0)
})
