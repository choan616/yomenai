// 숙지 분포 요약 막대 — 한 막대를 밴드별로 나눈다 (2026-09-22 사용자 제안).
//
// 밴드마다 막대를 주고 `stable / met` 을 그리던 자리다. 그 분모는 새 표현을 만날수록
// 늘어서 **숙지가 그대로여도 막대가 내려갔다**. 분모를 「숙지한 전체 개수」로 바꿨으므로
// 이 검사는 두 가지를 못 박는다 — 세그먼트 합이 100% 라는 것과, **출제를 늘려도 막대가
// 안 짧아진다**는 것.
import { expect, test } from '@playwright/test'

/** 밴드 0 · 음독. 셋을 숙지 상태로 만든다 */
const BAND0 = ['1000220', '1150680', '1150710']
/** 밴드 1 · 음독. 하나만 숙지 상태로 */
const BAND1 = ['1012210']

const DAY = 86_400_000
/** 이 간격으로 다섯 번 맞히면 FSRS stability 가 문턱(14일)을 넘는다 (실측 162일) */
const CORRECT_AT = [60, 45, 30, 15, 2]

type Row = { idiomId: string; days: number[]; correct: boolean }

async function seed(page: import('@playwright/test').Page, rows: Row[]) {
  await page.evaluate(
    ([rows, day]) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          rows.forEach((r, ri) => {
            r.days.forEach((d, i) => {
              store.put({
                id: `mix-${ri}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                at: Date.now() - d * day,
                idiomId: r.idiomId,
                cardType: 'reading',
                mistakeType: null,
                deletedAt: null,
                type: 'review',
                grade: r.correct ? 3 : 1,
                answer: 'x',
                expected: 'x',
                correct: r.correct,
                elapsedMs: 1000,
              })
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    [rows, DAY] as const,
  )
}

/** 세그먼트 폭을 비율로. 사이 간격 2px 을 되돌려 더한다 */
async function segments(page: import('@playwright/test').Page): Promise<number[]> {
  return page.locator('.mix-bar').evaluate((el) => {
    const w = [...el.children].map((c) => c.getBoundingClientRect().width)
    const total = w.reduce((a, b) => a + b, 0)
    return w.map((x) => x / total)
  })
}

test('요약 막대가 숙지한 표현을 밴드별로 나누고, 출제가 늘어도 안 짧아진다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })

  await seed(page, [
    ...BAND0.map((idiomId) => ({ idiomId, days: CORRECT_AT, correct: true })),
    ...BAND1.map((idiomId) => ({ idiomId, days: CORRECT_AT, correct: true })),
  ])
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await expect(page.locator('.mix-bar')).toBeVisible()

  // 숙지 4개 — 밴드 0 이 셋, 밴드 1 이 하나
  await expect(page.locator('.ladder-total')).toHaveText('4개')
  await expect(page.locator('.mix-legend')).toContainText('밴드 0 75%')
  await expect(page.locator('.mix-legend')).toContainText('밴드 1 25%')

  const before = await segments(page)
  expect(before).toHaveLength(2)
  expect(before[0]).toBeCloseTo(0.75, 2)
  expect(before[1]).toBeCloseTo(0.25, 2)

  // 밴드 행에는 막대가 없다 — 비율은 요약 막대가 한 번만 그린다
  await expect(page.locator('.ladder .bar-track')).toHaveCount(0)

  // 밴드마다 색이 다르고, 범례 점이 세그먼트와 같은 색이다 (2026-09-22 사용자 지시).
  // 둘이 갈리면 범례가 거짓말을 한다 — data-band 매핑이 깨지는 자리다
  const paint = await page.evaluate(() =>
    [...document.querySelectorAll('.mix-seg')].map((seg, i) => ({
      seg: getComputedStyle(seg).backgroundColor,
      dot: getComputedStyle(document.querySelectorAll('.mix-dot')[i]!).backgroundColor,
    })),
  )
  expect(paint).toHaveLength(2)
  for (const { seg, dot } of paint) expect(seg).toBe(dot)
  expect(paint[0]!.seg).not.toBe(paint[1]!.seg)

  // ── 핵심 — **출제만 늘린다.** 어제 처음 만나 틀린 표현 다섯. 숙지는 하나도 안 는다.
  //    옛 `stable / met` 이었다면 밴드 0 막대가 3/3 에서 3/8 로 내려앉던 자리다
  await seed(
    page,
    ['1150840', '1150860', '1151470', '1151820', '1152510'].map((idiomId) => ({
      idiomId,
      days: [1],
      correct: false,
    })),
  )
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await expect(page.locator('.mix-bar')).toBeVisible()

  await expect(page.locator('.ladder-total')).toHaveText('4개')
  const after = await segments(page)
  expect(after[0]).toBeCloseTo(before[0], 2)
  expect(after[1]).toBeCloseTo(before[1], 2)
})

test('흔들리는 밴드는 밴드 색을 잃지 않고 사선만 덧입는다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })

  await seed(page, [
    // 밴드 0 — 안정. 대조군이다
    ...BAND0.map((idiomId) => ({ idiomId, days: CORRECT_AT, correct: true })),
    // 밴드 2 — 둘은 숙지, 나머지는 최근에 계속 틀려 흔들림으로 떨어진다
    ...['1149590', '1150990'].map((idiomId) => ({ idiomId, days: CORRECT_AT, correct: true })),
    ...['1151090', '1151120', '1151900', '1152020'].map((idiomId) => ({
      idiomId,
      days: [4, 3, 2],
      correct: false,
    })),
  ])
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await expect(page.locator('.mix-bar')).toBeVisible()

  const shaky = page.locator('.mix-seg.band-shaky')
  await expect(shaky).toHaveCount(1)

  // ── 처음엔 朱 테두리였다. 22% 폭에서 안쪽 2px 이 위아래를 먹어 그냥 붉은 칸이 됐고,
  //    어느 밴드인지 색으로 못 읽혔다 (사용자 지적). 사선으로 바꾼 자리라 둘 다 못 박는다
  const paint = await shaky.evaluate((el) => {
    const s = getComputedStyle(el)
    return { color: s.backgroundColor, image: s.backgroundImage, shadow: s.boxShadow }
  })
  // ① 밴드 색이 그대로 남는다 — 안정 칸과 같은 방식으로 칠해져 있다
  const solid = await page
    .locator('.mix-seg:not(.band-shaky)')
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(paint.color).not.toBe('rgba(0, 0, 0, 0)')
  expect(paint.color).not.toBe(solid)
  // ② 표시는 사선이지 선이 아니다
  expect(paint.image).toContain('repeating-linear-gradient')
  expect(paint.shadow === 'none' || paint.shadow === '').toBe(true)
  // ③ 朱 는 막대에서 빠졌지만 범례 글자에는 남는다
  await expect(page.locator('.mix-key.band-shaky')).toHaveCount(1)

  // ── 밴드 표 (2026-09-23) — 흔들리는 행에만 왼쪽 줄이 선다
  const rules = await page.locator('.ladder tbody tr').evaluateAll((rows) =>
    rows.map((r) => {
      const cell = r.querySelector('th')
      if (!cell) return null
      const before = getComputedStyle(cell, '::before')
      return before.content === 'none' ? null : before.background
    }),
  )
  expect(rules.filter(Boolean).length).toBeGreaterThanOrEqual(1)

  // **큰 글자에서도 밴드 이름이 한 줄이다.** 「밴드 2 N2~N1 경계」가 가장 길다 —
  // 접히면 표의 열이 어긋나 정리한 이유가 사라진다
  await page.evaluate(() => document.documentElement.setAttribute('data-text-scale', 'lg'))
  const lines = await page
    .locator('.ladder tbody th')
    .evaluateAll((cells) => cells.map((c) => c.getClientRects().length))
  for (const n of lines) expect(n).toBe(1)
})
