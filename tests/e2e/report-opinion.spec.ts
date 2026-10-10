// 진단 소견 — 더 어려운 코스는 안정인데 쉬운 코스가 흔들리는 역전을 기록으로 설명한다 (2026-10-09 사용자 백업의 모양)
// 2026-10-10 판정 기준(최근 7일·채점 100회·표현 60개·오차 구간)에 맞춰 시드를 키웠다
import { expect, test } from '@playwright/test'
import { gradings, idsOf, putGradings, type Grading } from './level-seed.js'
import { openLevel } from './report-sheets.js'

/** 코스 0 · 장음을 틀리는 표현들(앱이 채점 때 장음으로 적어 두고, 소견이 다시 분류해 센다) */
const SOSHO = { id: '1397740', reading: 'そしょう', wrong: 'そうしょう' }
const HOSHU = { id: '1515700', reading: 'ほうしゅう', wrong: 'ほしゅう' }
const CHOCHIKU = { id: '1597700', reading: 'ちょちく', wrong: 'ちょうちく' }
const CHOON_IDS = [SOSHO.id, HOSHU.id, CHOCHIKU.id]

const choon = (w: { id: string; reading: string; wrong: string }, n: number): Grading[] =>
  Array.from({ length: n }, () => ({
    idiomId: w.id,
    daysAgo: 0,
    ok: false,
    mistakeType: 'CHOON',
    answer: w.wrong,
    expected: w.reading,
  }))

test('쉬운 코스가 흔들리는 역전을 소견이 기록으로 설명한다', async ({ page }) => {
  // 작은 화면 — 수준 시트가 스크롤돼야 「앞 시트의 스크롤을 물려받지 않는다」가 검증된다
  await page.setViewportSize({ width: 390, height: 640 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  // 산책로: 옛날(20일 전)에 100개 전부 맞혀 전체 기록은 높고, 오늘 하루 120회 중 84 정답(70%) —
  //   오답 36 = 장음 20(訴訟 ×8 · 報酬 ×8 · 貯蓄 ×4) + 그 밖 16. 7일 창이 오늘뿐이라 오차 구간이 문턱 아래로 내려간다
  await putGradings(page, gradings(0, 100, 100, 20), 'op-old')
  await putGradings(
    page,
    [
      ...idsOf(0, 84, CHOON_IDS).map((idiomId) => ({ idiomId, daysAgo: 0, ok: true })),
      ...choon(SOSHO, 8),
      ...choon(HOSHU, 8),
      ...choon(CHOCHIKU, 4),
      ...idsOf(0, 16, [...CHOON_IDS, ...idsOf(0, 84, CHOON_IDS)]).map((idiomId) => ({
        idiomId,
        daysAgo: 0,
        ok: false,
        mistakeType: 'ONYOMI_CHOICE',
        answer: 'ぬぬぬ',
      })),
    ],
    'op-today',
  )
  // 능선: 100회 중 92 정답 — 오차 구간의 아래쪽이 문턱 위라 안정이다
  await putGradings(page, gradings(3, 100, 92, 3), 'op-b3')
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
  await expect(overall).toContainText('더 쉬운 산책로 코스는 오차 범위를 감안해도')
  await expect(overall).toContainText('다음에는')
  await expect(text).toContainText('안정 능선')
  await expect(text).toContainText('흔들림 산책로')
  await expect(text).toContainText('오늘 하루 치 · 전체 기록')
  await expect(text.locator('.opinion-line.detail').first()).toBeHidden()
  await expect(text.getByText('訴訟 ×8')).toBeHidden()
  // 「자세히」를 눌러야 근거 문장이 보인다
  for (const s of await text.locator('summary').all()) await s.click()
  await expect(text.locator('.opinion-line.detail').first()).toBeVisible()
  await expect(text).toContainText('능선 코스는 최근 100회 정답률')
  // 기록으로 푼 이유 — 창의 모양, 전체 기록, 장음 쏠림, 반복 오답, 오차 구간
  await expect(text).toContainText('최근 120회가 모두 오늘 하루 치예요')
  await expect(text).toContainText('전체 기록은')
  await expect(text).toContainText('틀린 36개 중 20개가 장음이에요')
  await expect(text).toContainText('訴訟 ×8 · 報酬 ×8 · 貯蓄 ×4')
  await expect(text).toContainText('오차 범위(')
  await expect(text).toContainText('안정 기준 80%보다 낮아요')
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
  await putGradings(page, gradings(0, 3, 3, 1), 'op-few') // 기록이 하나도 없으면 「더 보기」 줄 자체가 안 그려진다
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.locator('.tools').getByRole('button', { name: /진단 소견/ }).click()
  await expect(page.getByRole('dialog')).toHaveAccessibleName('진단 소견')
  // 기록이 거의 없으면 한 문단만 — 지어내지 않는다
  await expect(page.locator('.opinion .opinion-sec')).toHaveCount(1)
  await expect(page.locator('.opinion')).toContainText('더 쌓이면 소견을 쓸 수 있어요')
})
