// 리포트 오답 분포가 탁음을 갈래로 나눠 보여주는지 (사용자 지적 2026-09-17 「각각을 나눌 수 없나」).
//
// 저장된 유형은 RENDAKU 하나뿐이다. 분포에 「반탁」이 뜨면 답으로 다시 매기는 길이
// replay 를 지나 리포트 화면까지 이어진 것이다. 카드가 「반탁」이라 부르는 오답을
// 리포트가 「연탁」이라 부르던 자리다.
import { expect, test } from '@playwright/test'

/** 心配 しんぱい 를 しんはい 로 — 반탁 자리 */
const SHINPAI = '1360930'
/** 三日月 みかづき 를 みかつき 로 — 연탁 자리 */
const MIKAZUKI = '1579550'

test('리포트 분포가 반탁과 연탁을 따로 센다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    ([han, ren]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          // 반탁 2회 · 연탁 1회 — 저장 유형은 셋 다 RENDAKU 다
          const rows: [string, string, string, number][] = [
            [han, 'しんぱい', 'しんはい', 0],
            [han, 'しんぱい', 'しんはい', 1],
            [ren, 'みかづき', 'みかつき', 2],
          ]
          rows.forEach(([idiomId, expected, answer, i]) => {
            store.put({
              id: `0000002${i}-rx`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType: 'RENDAKU',
              deletedAt: null,
              type: 'review',
              grade: 1,
              answer,
              expected,
              correct: false,
              elapsedMs: 1000,
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [SHINPAI, MIKAZUKI],
  )
  await page.reload()

  await page.getByRole('button', { name: '리포트', exact: true }).click()
  const bars = page.locator('.bars')
  await expect(bars).toBeVisible({ timeout: 20_000 })

  // 갈래 이름으로 뜬다 — 묶음 이름(연탁)이 반탁 2회를 덮어쓰지 않는다
  const rows = bars.locator('.bar-row')
  await expect(rows.filter({ hasText: '반탁' })).toHaveCount(1)
  await expect(rows.filter({ hasText: '반탁' }).locator('.bar-num')).toHaveText('2')
  await expect(rows.filter({ hasText: '연탁' }).locator('.bar-num')).toHaveText('1')

  // 1등 오답 칸 — 「한국음 간섭」으로 고정돼 있던 자리를 지금 제일 많은 유형이 쓴다 (2026-09-18)
  const top = page.locator('.top-mistake')
  await expect(top.locator('.section-title')).toHaveText('반탁')
  await expect(top.locator('.top-count b')).toHaveText('2')
  await expect(top.locator('.rows')).toContainText('心配')

  // 그 칸 맨 위 버튼은 그 유형만 걸러 다시보기로 간다
  await top.getByRole('button', { name: /모아서 다시보기/ }).click()
  await expect(page.locator('.browse-slide').filter({ hasText: '心配' })).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(page.locator('.browse-slide').filter({ hasText: '三日月' })).toHaveCount(0)
})
