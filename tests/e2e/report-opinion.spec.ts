// 진단 소견 — 더 어려운 코스는 안정인데 쉬운 코스가 흔들리는 역전을 기록으로 설명한다 (2026-10-09 사용자 백업의 모양)
import { expect, test, type Page } from '@playwright/test'
import { openLevel } from './report-sheets.js'

const DAY = 86_400_000

/** 코스 0 · 明白(안 틀리는 쪽) / 訴訟·報酬·貯蓄(장음을 틀리는 쪽) · 코스 1·2·3 */
const B0 = { id: '1000220', reading: 'めいはく' }
const SOSHO = { id: '1397740', reading: 'そしょう', wrong: 'そうしょう' }
const HOSHU = { id: '1515700', reading: 'ほうしゅう', wrong: 'ほしゅう' }
const CHOCHIKU = { id: '1597700', reading: 'ちょちく', wrong: 'ちょうちく' }
const B1 = { id: '1012210', reading: 'ちゅうじつ' }
const B2 = { id: '1149590', reading: 'あえん' }
const B3 = { id: '1013270', reading: 'れっき' }

type Ev = { idiomId: string; daysAgo: number; ok: boolean; answer: string; expected: string; type?: string }

async function seed(page: Page, events: Ev[]) {
  await page.evaluate(
    ([events, day]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          events.forEach((e, i) =>
            store.put({
              id: `op-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - e.daysAgo * day + i,
              idiomId: e.idiomId,
              cardType: 'reading',
              // 실제 앱은 채점할 때 유형을 적어 둔다 — 소견은 그 값을 다시 분류해 센다
              mistakeType: e.type ?? null,
              deletedAt: null,
              type: 'review',
              grade: e.ok ? 3 : 1,
              answer: e.answer,
              expected: e.expected,
              correct: e.ok,
              elapsedMs: 4000,
            }),
          )
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [events, DAY] as const,
  )
}

const right = (w: { id: string; reading: string }, n: number, daysAgo: number): Ev[] =>
  Array.from({ length: n }, () => ({ idiomId: w.id, daysAgo, ok: true, answer: w.reading, expected: w.reading }))
const wrong = (w: { id: string; reading: string; wrong: string }, n: number): Ev[] =>
  Array.from({ length: n }, () => ({ idiomId: w.id, daysAgo: 0, ok: false, answer: w.wrong, expected: w.reading, type: 'CHOON' }))

test('쉬운 코스가 흔들리는 역전을 소견이 기록으로 설명한다', async ({ page }) => {
  // 작은 화면 — 수준 시트가 스크롤돼야 「앞 시트의 스크롤을 물려받지 않는다」가 검증된다
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seed(page, [
    // 산책로: 옛날에 길게 잘함 → 오늘 하루 30회(22 정답, 오답 8 = 장음 5 + 그 밖 3)
    ...right(B0, 60, 20),
    ...right(B0, 22, 0),
    ...wrong(SOSHO, 2),
    ...wrong(HOSHU, 2),
    ...wrong(CHOCHIKU, 1),
    ...Array.from({ length: 3 }, () => ({ idiomId: B0.id, daysAgo: 0, ok: false, answer: 'ぬぬぬ', expected: B0.reading })),
    // 위 코스들은 안정(30회 중 25~26 정답)
    ...right(B1, 25, 5),
    ...Array.from({ length: 5 }, () => ({ idiomId: B1.id, daysAgo: 5, ok: false, answer: 'ぬぬぬ', expected: B1.reading })),
    ...right(B2, 25, 4),
    ...Array.from({ length: 5 }, () => ({ idiomId: B2.id, daysAgo: 4, ok: false, answer: 'ぬぬぬ', expected: B2.reading })),
    ...right(B3, 26, 3),
    ...Array.from({ length: 4 }, () => ({ idiomId: B3.id, daysAgo: 3, ok: false, answer: 'ぬぬぬ', expected: B3.reading })),
  ])
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await openLevel(page)

  // 수준 시트가 역전을 알아보고 소견으로 잇는다
  const link = page.getByRole('button', { name: /더 쉬운 코스가 흔들리는 이유/ })
  await expect(link).toBeVisible()
  // 앞 시트를 조금 내려 둔 채 넘어가도 소견은 맨 위부터 보인다
  // (Playwright 의 click 은 링크를 보이게 하려고 스크롤을 되돌리므로, 스크롤한 채 DOM 클릭을 바로 보낸다)
  await link.evaluate((el) => {
    el.closest('.sheet-body')!.scrollTo(0, 30)
    ;(el as HTMLElement).click()
  })

  const dialog = page.getByRole('dialog')
  await expect(dialog).toHaveAccessibleName('진단 소견')
  const text = dialog.locator('.opinion')
  await expect.poll(() => page.locator('.sheet-body').evaluate((el) => el.scrollTop)).toBe(0)
  // 맨 위 총평이 결론을 말하고, 항목은 한 줄 요약만 보이며 근거는 접혀 있다
  const overall = text.locator('.opinion-overall')
  await expect(overall).toContainText('능선 코스까지 안정적으로 읽어요')
  await expect(overall).toContainText('더 쉬운 산책로 코스가 흔들리는 건')
  await expect(overall).toContainText('다음에는')
  await expect(text).toContainText('안정 능선')
  await expect(text).toContainText('흔들림 산책로')
  await expect(text).toContainText('오늘 하루 치 · 전체 기록')
  await expect(text.locator('.opinion-line.detail').first()).toBeHidden()
  await expect(text.getByText('訴訟 ×2')).toBeHidden()
  // 「자세히」를 눌러야 근거 문장이 보인다
  for (const s of await text.locator('summary').all()) await s.click()
  await expect(text.locator('.opinion-line.detail').first()).toBeVisible()
  await expect(text).toContainText('능선 코스는 최근 30회 정답률')
  // 기록으로 푼 이유 — 창의 모양, 전체 기록, 장음 쏠림, 반복 오답
  await expect(text).toContainText('최근 30회가 모두 오늘 하루 치예요')
  await expect(text).toContainText('전체 기록은')
  await expect(text).toContainText('가 장음이에요')
  await expect(text).toContainText('訴訟 ×2 · 報酬 ×2')
  await expect(text).toContainText('안정 문턱 80%가 그 안에 들어요')
  await expect(text).toContainText('실제 정답률은')
  // 일본어 표기는 lang="ja" 로 그려진다 (한국 자형 방지)
  await expect(text.locator('[lang="ja"]').filter({ hasText: '訴訟' })).not.toHaveCount(0)
  // 달래는 말·막힘 표현은 없다
  for (const bad of ['겁', '걱정', '괜찮', '막혀', '막힘']) await expect(text).not.toContainText(bad)
})

test('「더 보기」의 진단 소견 줄로도 열린다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seed(page, right(B0, 3, 1)) // 기록이 하나도 없으면 「더 보기」 줄 자체가 안 그려진다
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.locator('.tools').getByRole('button', { name: /진단 소견/ }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('진단 소견')
  // 기록이 거의 없으면 한 문단만 — 지어내지 않는다
  await expect(page.locator('.opinion .opinion-sec')).toHaveCount(1)
  await expect(page.locator('.opinion')).toContainText('더 쌓이면 소견을 쓸 수 있어요')
})
