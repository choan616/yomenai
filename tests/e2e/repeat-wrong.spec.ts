// 같은 오답을 낸 그 순간 피드백에 한 줄을 붙인다 (PLAN §11 D4 ②).
//
// 交渉 こうしょう 를 쓴다 — 교정 모드(읽기 한 장)라 별 하나로 보통 세션에 서고, 틀린 기록 하나로 재도전 세션에도 선다.
// 오답 こうじょう 는 渉 한 조각만 틀린 것이고, 같은 읽기의 표현(工場·向上·恒常…) 중 학습한 것이 정확히 하나일 때만 짝이 나온다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

const KOUSHOU = '1272110' // 交渉 こうしょう
const KOUJOU = '1578700' // 工場 こうじょう
const KOUJOU2 = '1277250' // 向上 こうじょう
/** 한 줄의 기본형만 나오는 보조 카드들(王子 課題 干渉 公団) — 답 ぬぬぬ 를 전에 냈다 */
const FILLERS = ['1181500', '1195820', '1212050', '1274280']

type Kind = 'normal' | 'rematch'

async function ready(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
}

async function putEvents(page: Page, events: Record<string, unknown>[]): Promise<void> {
  await page.evaluate(
    (events) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          for (const e of events) tx.objectStore('events').put(e)
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    events,
  )
}

let seq = 0
const review = (idiomId: string, ok: boolean, answer: string, expected: string, ago: number) => ({
  id: `repeat-${seq++}`, userId: 'local', deviceId: 'e2e', at: Date.now() - ago,
  idiomId, cardType: 'reading', mistakeType: null, deletedAt: null,
  type: 'review', grade: ok ? 3 : 1, answer, expected, correct: ok, elapsedMs: 1500,
})
// 사흘 전에 틀렸다 — 보통 세션은 기한이 지난 카드만 다시 내므로(별은 카드가 없는 표현에만 듣는다) 기한이 와 있어야 선다
const wrong = (idiomId: string, answer: string, expected: string, ago = 3 * 86_400_000) =>
  review(idiomId, false, answer, expected, ago)
const right = (idiomId: string, expected: string) => review(idiomId, true, expected, expected, 5000)
const star = (idiomId: string) => ({
  id: `repeat-star-${seq++}`, userId: 'local', deviceId: 'e2e', at: Date.now() - 1000,
  idiomId, cardType: 'reading', mistakeType: null, deletedAt: null, type: 'star', on: true,
})

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

/** 지금 화면에서 한 걸음 — 읽기 카드가 아니면 넘기고, 읽기 카드에는 `nununu`(ぬぬぬ)로 답한다 */
async function step(page: Page, answer: string): Promise<void> {
  if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
    await clickIfVisible(page, '다음')
    return
  }
  if (await clickIfVisible(page, '건너뛰기')) return
  if (await clickIfVisible(page, '봤어요')) return
  if (await clickIfVisible(page, '알고 있었다')) return
  const input = page.locator('.kana-input')
  if (await input.isVisible().catch(() => false)) {
    await input.fill(answer)
    await input.press('Enter')
    return
  }
  if (await clickIfVisible(page, '뜻 보기')) return
  if (await clickIfVisible(page, '알았어요')) return
  await page.waitForTimeout(30)
}

/** 읽기 카드(피드백 전)의 표기가 `headword` 일 때까지 다른 카드를 넘긴다 */
async function reachReading(page: Page, headword: string): Promise<void> {
  for (let i = 0; i < 300; i++) {
    const fb = await page.locator('.card.feedback').isVisible().catch(() => false)
    const input = await page.locator('.kana-input').isVisible().catch(() => false)
    if (!fb && input) {
      const text = await page.locator('.card .headword').first().innerText().catch(() => '')
      if (text.trim() === headword) return
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    await step(page, 'nununu')
  }
  throw new Error(`${headword} 읽기 카드를 못 만났다`)
}

/** 기록을 심고 세션을 연다. 보통 세션은 交渉 를 담아 앞자리에 세우고 그 카드까지 넘긴다 */
async function open(page: Page, kind: Kind, rows: Record<string, unknown>[]): Promise<void> {
  await ready(page)
  await putEvents(page, kind === 'normal' ? [star(KOUSHOU), ...rows] : rows)
  await page.reload()
  if (kind === 'normal') {
    await page.getByRole('button', { name: '세션 시작', exact: true }).click()
  } else {
    await page.getByRole('button', { name: /재도전/ }).click()
  }
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })
  await reachReading(page, '交渉')
}

async function answer(page: Page, romaji: string): Promise<void> {
  await page.locator('.kana-input').fill(romaji)
  await page.locator('.kana-input').press('Enter')
}

const HINT = '.card.feedback .repeat-hint'
const FULL =
  '전에도 こうじょう 로 읽었어요. 여기서 渉 는 しょう 로 읽어요. こうじょう 는 工場 의 읽기예요.'

for (const kind of ['normal', 'rematch'] as const) {
  test(`${kind}: 같은 오답을 또 내면 그 순간 한 줄이 뜨고 일본어는 lang="ja" 안에 있다`, async ({ page }) => {
    await open(page, kind, [wrong(KOUSHOU, 'こうじょう', 'こうしょう'), right(KOUJOU, 'こうじょう')])
    await answer(page, 'koujou')
    await expect(page.locator('.card.feedback.is-ng')).toBeVisible()

    const hint = page.locator(HINT)
    await expect(hint).toHaveText(FULL)
    // 답·조각·짝 표기가 모두 lang="ja" 안에 있다 — 한국 자형으로 나가면 틀린 글자 모양을 학습한다
    await expect(hint.locator('[lang="ja"]')).toHaveText(['こうじょう', '渉', 'しょう', 'こうじょう', '工場'])
    const stray = await hint.evaluate((el) => {
      const JA = /[々〆ー぀-ヿ㐀-䶿一-鿿]/
      const out: string[] = []
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
        const t = (n.textContent ?? '').trim()
        if (JA.test(t) && n.parentElement?.closest('[lang="ja"]') === null) out.push(t)
      }
      return out
    })
    expect(stray).toEqual([])
    // 횟수 숫자와 질책·막힘 말은 없다
    const text = await hint.innerText()
    expect(text).not.toMatch(/\d/)
    expect(text).not.toMatch(/또|다시 틀|번째|계속/)
    // 오답 상세에는 넣지 않는다
    await page.getByRole('button', { name: '자세히', exact: true }).click()
    await expect(page.locator('.mistake-detail')).toBeVisible()
    await expect(page.locator('.mistake-detail .repeat-hint')).toHaveCount(0)
  })
}

test('조각만 있고 짝이 없으면 답과 조각까지만 나온다', async ({ page }) => {
  await open(page, 'rematch', [wrong(KOUSHOU, 'こうじょう', 'こうしょう')])
  await answer(page, 'koujou')
  await expect(page.locator(HINT)).toHaveText('전에도 こうじょう 로 읽었어요. 여기서 渉 는 しょう 로 읽어요.')
})

test('학습한 짝이 둘이면 짝 문장은 없다', async ({ page }) => {
  await open(page, 'rematch', [
    wrong(KOUSHOU, 'こうじょう', 'こうしょう'),
    right(KOUJOU, 'こうじょう'),
    right(KOUJOU2, 'こうじょう'),
  ])
  await answer(page, 'koujou')
  const hint = page.locator(HINT)
  await expect(hint).toHaveText('전에도 こうじょう 로 읽었어요. 여기서 渉 는 しょう 로 읽어요.')
  await expect(hint).not.toContainText('의 읽기예요')
})

test('처음 내는 오답이면 한 줄이 없다', async ({ page }) => {
  // 交渉 의 기록이 없다 — 별로만 선다. 짝 후보(工場)를 배워 둬도 첫 오답에는 안 붙는다
  await open(page, 'normal', [right(KOUJOU, 'こうじょう')])
  await answer(page, 'koujou')
  await expect(page.locator('.card.feedback.is-ng')).toBeVisible()
  await expect(page.locator('.repeat-hint')).toHaveCount(0)
})

test('전에 낸 오답과 다른 오답이면 한 줄이 없다', async ({ page }) => {
  await open(page, 'rematch', [wrong(KOUSHOU, 'ぬぬぬ', 'こうしょう'), right(KOUJOU, 'こうじょう')])
  await answer(page, 'koujou')
  await expect(page.locator('.card.feedback.is-ng')).toBeVisible()
  await expect(page.locator('.repeat-hint')).toHaveCount(0)
})

test('정답이면 한 줄이 없다', async ({ page }) => {
  await open(page, 'rematch', [wrong(KOUSHOU, 'こうじょう', 'こうしょう')])
  await answer(page, 'koushou')
  await expect(page.locator('.card.feedback.is-ok')).toBeVisible()
  await expect(page.locator('.repeat-hint')).toHaveCount(0)
})

test('한 줄이 떠도 카드 전환은 150ms 이하다', async ({ page }) => {
  const rows = [
    wrong(KOUSHOU, 'こうじょう', 'こうしょう'),
    right(KOUJOU, 'こうじょう'),
    ...FILLERS.map((id) => wrong(id, 'ぬぬぬ', 'x')),
  ]
  await ready(page)
  await putEvents(page, rows)
  await page.reload()
  await page.getByRole('button', { name: /재도전/ }).click()
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })

  // 읽기 카드마다 전에 낸 답과 같은 답을 내고, 한 줄이 뜬 것을 확인한 뒤 넘긴다
  let hints = 0
  for (let i = 0; i < 80; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    const fb = page.locator('.card.feedback')
    if (await fb.isVisible().catch(() => false)) {
      if ((await page.locator(HINT).count()) > 0) {
        hints++
        expect(await page.locator(HINT).innerText()).not.toMatch(/\d/)
      }
      await clickIfVisible(page, '다음')
      continue
    }
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      const head = (await page.locator('.card .headword').first().innerText()).trim()
      await input.fill(head === '交渉' ? 'koujou' : 'nununu')
      await input.press('Enter')
      continue
    }
    await step(page, 'nununu')
  }
  expect(hints).toBe(5)
  // 마지막 전환의 측정은 다음 프레임에 찍힌다 — 세션 완료 화면을 보자마자 읽으면 빠진다
  await page.waitForTimeout(300)

  const durations: number[] = await page.evaluate(() =>
    performance.getEntriesByName('yomenai:transition').map((m) => m.duration),
  )
  console.log(`한 줄 뜬 세션 전환 ${durations.length}회 · 최대 ${Math.max(...durations).toFixed(1)}ms`)
  expect(durations.length).toBeGreaterThanOrEqual(5)
  expect(Math.max(...durations)).toBeLessThanOrEqual(150)
})
