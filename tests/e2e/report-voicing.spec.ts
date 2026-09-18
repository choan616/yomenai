// 리포트 오답 분포가 탁음을 갈래로 나눠 보여주는지 (사용자 지적 2026-09-17 「각각을 나눌 수 없나」).
//
// 저장된 유형은 RENDAKU 하나뿐이다. 분포에 「반탁」이 뜨면 답으로 다시 매기는 길이
// replay 를 지나 리포트 화면까지 이어진 것이다. 카드가 「반탁」이라 부르는 오답을
// 리포트가 「연탁」이라 부르던 자리다.
import { expect, test } from '@playwright/test'

/** 心配 しんぱい 를 しんはい 로 — 반탁 자리 */
const SHINPAI = '1360930'
/** 三日月 みかづき 를 みかつき 로 — 연탁 자리. **코퍼스에 없는 숙어라** 집계에만 든다 */
const MIKAZUKI = '1579550'
/** 明白 めいはく — 다시보기에 실리려면 코퍼스에 있어야 한다 */
const MEIHAKU = '1000220'

test('리포트 분포가 반탁·연탁을 따로 세고 이름 없는 오답을 다른 읽기로 담는다', async ({ page }) => {
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
          // 반탁 2회 · 연탁 1회 (저장 유형은 셋 다 RENDAKU) · 이름이 안 붙은 오답 1회 ·
          // 「모르겠어요」로 넘긴 빈 답 1회
          const rows: [string, string, string, number, string | null][] = [
            [han, 'しんぱい', 'しんはい', 0, 'RENDAKU'],
            [han, 'しんぱい', 'しんはい', 1, 'RENDAKU'],
            [ren, 'みかづき', 'みかつき', 2, 'RENDAKU'],
            [ren, 'みかづき', 'ずぼぼぼ', 3, null],
            [han, 'しんぱい', '', 4, null],
          ]
          rows.forEach(([idiomId, expected, answer, i, mistakeType]) => {
            store.put({
              id: `0000002${i}-rx`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType,
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

  // 유형을 못 붙인 오답은 「다른 읽기」라는 이름을 받고, 등수대로 정렬에 든다 (2026-09-18)
  await expect(rows.filter({ hasText: '다른 읽기' }).locator('.bar-num')).toHaveText('1')
  // 넘김(빈 답)은 이름이 아니라 답이 없는 것이라 맨 아래 고정이다
  await expect(rows.last()).toContainText('넘김')
  await expect(rows.last().locator('.bar-num')).toHaveText('1')

  // 다시보기 진입 둘 — 한 줄에 무작위 / 1등 유형별 (사용자 지시 2026-09-18)
  const pair = page.locator('.browse-pair')
  await expect(pair.getByRole('button', { name: /무작위 다시보기/ })).toBeVisible()
  const byType = pair.getByRole('button', { name: /오답 유형별 다시보기/ })
  await expect(byType).toContainText('반탁')

  await byType.click()
  await expect(page.locator('.browse-slide').filter({ hasText: '心配' })).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(page.locator('.browse-slide').filter({ hasText: '三日月' })).toHaveCount(0)
})

/**
 * 「다른 읽기」도 다시보기로 이어진다 (2026-09-18, 사용자 결정).
 *
 * 저장값이 `null` 인 오답이라 유형 필터가 못 쓰던 길이다. 이름을 준 이상 그 숙어들만
 * 모아 볼 수 있어야 한다 — 이름만 붙이고 길이 없으면 분포에 글자만 하나 는 것이다.
 */
test('이름 없는 오답이 1등이면 그 숙어들만 모아 다시본다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    ([han, mei]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          // 이름이 안 붙은 오답 3회(心配) · 탁음 1회(明白) — 1등은 「다른 읽기」다.
          // **둘 다 코퍼스에 있는 숙어여야 한다** — 다시보기는 이름을 못 찾는 숙어를 안 싣는다
          const rows: [string, string, string, number, string | null][] = [
            [han, 'しんぱい', 'ずぼぼぼ', 0, null],
            [han, 'しんぱい', 'あいうえ', 1, null],
            [han, 'しんぱい', 'かきくけ', 2, null],
            [mei, 'めいはく', 'めいばく', 3, 'RENDAKU'],
          ]
          rows.forEach(([idiomId, expected, answer, i, mistakeType]) => {
            store.put({
              id: `0000003${i}-un`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType,
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
    [SHINPAI, MEIHAKU],
  )
  await page.reload()

  await page.getByRole('button', { name: '리포트', exact: true }).click()
  const bars = page.locator('.bars')
  await expect(bars).toBeVisible({ timeout: 20_000 })
  // 정렬에 들어 1등이 된다 — 맨 아래 고정이던 「기타」와 다른 점이다
  await expect(bars.locator('.bar-row').first()).toContainText('다른 읽기')

  const byType = page.locator('.browse-pair').getByRole('button', { name: /오답 유형별 다시보기/ })
  await expect(byType).toContainText('다른 읽기')
  await byType.click()
  await expect(page.locator('.browse-slide').filter({ hasText: '心配' })).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(page.locator('.browse-slide').filter({ hasText: '明白' })).toHaveCount(0)
})
