// 세션 중간 환기 퀴즈 (PLAN §11 S4 ③) — 객관식 2문항 한 덩어리, 기록 없음, 한 탭 건너뛰기, 진행 분모 그대로.
//
// 퀴즈는 「세션에 단독 신규 카드가 있고, 지나온 숙어에서 같은 읽기 다른 표기 문항이 둘 나올 때」만 선다.
// 기록이 없는 새 기기에서는 신규가 읽기·뜻 한 쌍이라 거의 안 서므로, 동형동의(교정 모드 → 읽기 한 장)이면서
// 보기를 셋 이상 낼 수 있는 표현 여섯을 담아(`star`) 앞자리에 세운다. 담은 것은 신규 도입에서 면제되고
// 앞자리를 지킨다(`select.ts`). 사전이 다시 빌드돼 이 여섯이 조건을 잃으면 이 파일이 먼저 깨진다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

/** 王子 課題 干渉 交渉 公団 工作 — category 1(교정 모드), 읽기가 서로 다르고 동음이의 보기를 3개 이상 낸다 */
const QUIZ_IDS = ['1181500', '1195820', '1212050', '1272110', '1274280', '1278100']

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

const star = (id: string, i: number) => ({
  id: `quiz-star-${i}`, userId: 'local', deviceId: 'e2e', at: Date.now() - 1000 + i,
  idiomId: id, cardType: 'reading', mistakeType: null, deletedAt: null, type: 'star', on: true,
})

/** 담은 여섯을 심고 보통 세션을 연다 */
async function startNormal(page: Page): Promise<void> {
  await ready(page)
  await putEvents(page, QUIZ_IDS.map(star))
  await page.reload()
  await page.getByRole('button', { name: '세션 시작', exact: true }).click()
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })
}

/** 채점 이벤트(`review`) 수 — 퀴즈가 기록을 남기면 여기서 늘어난다. 지연 검수 응답 등은 세지 않는다 */
async function reviewCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const all = req.result.transaction('events', 'readonly').objectStore('events').getAll()
          all.onsuccess = () =>
            res((all.result as { type: string }[]).filter((e) => e.type === 'review').length)
          all.onerror = () => res(-1)
        }
        req.onerror = () => res(-1)
      }),
  )
}

async function eventCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const all = req.result.transaction('events', 'readonly').objectStore('events').getAll()
          all.onsuccess = () => res(all.result.length)
          all.onerror = () => res(-1)
        }
        req.onerror = () => res(-1)
      }),
  )
}

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

type Step = 'done' | 'quiz' | 'graded' | 'moved' | 'idle'

/** 지금 화면에서 한 걸음. 채점 카드를 하나 끝냈으면 `graded` — 이벤트 한 줄이 생긴다 */
async function step(page: Page): Promise<Step> {
  if (await page.getByText('세션 완료').isVisible().catch(() => false)) return 'done'
  if (await page.locator('.quiz-card').isVisible().catch(() => false)) return 'quiz'
  if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
    return (await clickIfVisible(page, '다음')) ? 'graded' : 'idle'
  }
  if (await clickIfVisible(page, '봤어요')) return 'moved'
  if (await clickIfVisible(page, '알고 있었다')) return 'moved'
  const input = page.locator('.kana-input')
  if (await input.isVisible().catch(() => false)) {
    await input.fill('tadashii')
    await input.press('Enter')
    return 'moved'
  }
  if (await clickIfVisible(page, '뜻 보기')) return 'moved'
  if (await clickIfVisible(page, '알았어요')) return 'graded'
  await page.waitForTimeout(30)
  return 'idle'
}

/** 퀴즈가 설 때까지 진행한다. 지금까지 끝낸 채점 카드 수를 돌려준다 */
async function toQuiz(page: Page): Promise<number> {
  let graded = 0
  for (let i = 0; i < 300; i++) {
    const s = await step(page)
    if (s === 'quiz') return graded
    if (s === 'graded') graded++
    if (s === 'done') throw new Error('퀴즈가 서지 않고 세션이 끝났다')
  }
  throw new Error('퀴즈를 못 만났다')
}

/** 퀴즈 뒤 세션이 끝날 때까지 진행한다. 끝낸 채점 카드 수를 돌려준다 */
async function toEnd(page: Page): Promise<number> {
  let graded = 0
  for (let i = 0; i < 300; i++) {
    const s = await step(page)
    if (s === 'quiz') throw new Error('퀴즈가 두 번 섰다')
    if (s === 'graded') graded++
    if (s === 'done') return graded
  }
  throw new Error('세션이 안 끝났다')
}

const countText = (page: Page) => page.locator('.study-bar .count').innerText()
const parseCount = (t: string) => {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(t)
  if (!m) throw new Error(`진행 표시를 못 읽었다: ${t}`)
  return { index: Number(m[1]), total: Number(m[2]) }
}

/** 사전에서 이 문항의 정답 표기를 구한다 — 화면은 답을 고르기 전에 알려 주지 않는다 */
async function answerHeadwords(page: Page, reading: string, meaning: string): Promise<string[]> {
  return page.evaluate(
    async ([reading, meaning]) => {
      const d = (await (await fetch('/dict/base.json')).json()) as {
        idioms: { headword: string; reading: string; koMeaning: { definition: string } | null }[]
      }
      return d.idioms
        .filter((i) => i.reading === reading && i.koMeaning?.definition === meaning)
        .map((i) => i.headword)
    },
    [reading, meaning] as const,
  )
}

/** 사전에서 이 표기의 모든 읽기(히라가나)를 구한다 — 읽기 고르기의 정답이다 */
async function readingsOf(page: Page, headword: string): Promise<string[]> {
  return page.evaluate(async (hw) => {
    const d = (await (await fetch('/dict/base.json')).json()) as { idioms: { headword: string; reading: string }[] }
    const hira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    return d.idioms.filter((i) => i.headword === hw).map((i) => hira(i.reading))
  }, headword)
}

test('보통 세션 중간에 퀴즈가 서고, 진행 분모는 설정 장수(20) 그대로다', async ({ page }) => {
  await startNormal(page)
  expect(parseCount(await countText(page))).toEqual({ index: 0, total: 20 })

  const before = await toQuiz(page)
  const at = parseCount(await countText(page))
  // 채점 카드 19장 + 퀴즈 한 칸 = 20. 절반쯤에서 선다
  expect(at.total).toBe(20)
  expect(at.index).toBe(before)
  expect(at.index).toBeGreaterThanOrEqual(7)
  expect(at.index).toBeLessThanOrEqual(13)
  await expect(page.locator('.study-bar progress')).toHaveAttribute('max', '20')

  // 덩어리 안 문항 번호는 안 보인다 — 「퀴즈 1/2」 같은 숫자가 늘면 길게 느껴진다
  const quizText = await page.locator('.quiz-card').innerText()
  expect(quizText).not.toMatch(/\d\s*\/\s*\d/)
  // 「절반 왔어요 · 정답 N」 도 안 뜬다 — 사라지며 보기를 밀어 올리고, 점수 없는 화면에 점수가 뜬다
  await expect(page.locator('.mid-note')).toHaveCount(0)

  // 두 문항을 풀고 「계속」 — 퀴즈를 지나면 칸이 하나 늘어 있다
  await page.locator('.quiz-opt').first().click()
  await page.getByRole('button', { name: '다음', exact: true }).click()
  await page.locator('.quiz-opt').first().click()
  await page.getByRole('button', { name: '계속', exact: true }).click()
  await expect(page.locator('.quiz-card')).toHaveCount(0)
  await expect.poll(async () => parseCount(await countText(page))).toEqual({ index: at.index + 1, total: 20 })

  // 끝까지 — 채점 이벤트는 채점 카드 몫(19)만이다. 퀴즈가 한 줄도 보태지 않는다
  const after = await toEnd(page)
  expect(before + after).toBe(19)
  await expect.poll(() => reviewCount(page)).toBe(19)
})

test('보기를 누르면 그 자리에서 정답이 드러나고, 「다음」과 Enter 로 넘어간다', async ({ page }) => {
  // iPhone SE + Safari 툴바로 줄어든 높이 — 보기 앞뒤 어느 쪽도 카드 안에서 스크롤이 생기지 않는다
  await page.setViewportSize({ width: 375, height: 553 })
  await startNormal(page)
  await toQuiz(page)
  const reviews = await reviewCount(page)

  const overflow = () =>
    page.locator('.quiz-card .card-body').evaluate((e) => e.scrollHeight - e.clientHeight)
  expect(await overflow()).toBeLessThanOrEqual(0)
  const opts = page.locator('.quiz-opt')
  const n = await opts.count()
  expect(n).toBeGreaterThanOrEqual(3)
  expect(n).toBeLessThanOrEqual(4)
  // 고르기 전: 정답 표시가 없고, 「다음」은 자리만 지킨다
  await expect(page.locator('.quiz-opt.is-ok, .quiz-opt.is-ng')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '다음', exact: true })).toBeHidden()

  // 문항 1 — 일부러 오답을 고른다
  const reading1 = await page.locator('.quiz-card .headword').innerText()
  // 뜻은 처음에 가려져 있고(자리는 지킨다), 탭하면 보인다
  await expect(page.locator('.quiz-card .meaning')).toBeHidden()
  await page.getByRole('button', { name: '뜻 보기', exact: true }).click()
  await expect(page.locator('.quiz-card .meaning')).toBeVisible()
  const meaning1 = await page.locator('.quiz-card .meaning').innerText()
  const right1 = await answerHeadwords(page, reading1, meaning1)
  expect(right1.length).toBeGreaterThan(0)
  const heads = await page.locator('.quiz-opt-word [lang="ja"]').allInnerTexts()
  const wrongAt = heads.findIndex((h) => !right1.includes(h))
  expect(wrongAt).toBeGreaterThanOrEqual(0)
  const heightBefore = (await page.locator('.quiz-opts').boundingBox())!.height
  await opts.nth(wrongAt).click()

  // 정답 하나는 ✓, 고른 오답만 ✗ + 朱 — 나머지 보기는 평범하다. 보기에는 뜻을 더하지 않는다
  await expect(page.locator('.quiz-opt.is-ok')).toHaveCount(1)
  await expect(page.locator('.quiz-opt.is-ok [lang="ja"]')).toHaveText(right1.length === 1 ? right1[0]! : /.+/)
  await expect(page.locator('.quiz-opt.is-ng')).toHaveCount(1)
  await expect(opts.nth(wrongAt)).toHaveClass(/is-ng/)
  await expect(page.locator('.quiz-opt .quiz-opt-mark')).toHaveCount(2)
  // 고른 뒤에도 보기 영역은 길어지지 않는다 — 길어지면 작은 화면에서 스크롤이 생기고 누르는 순간 보기가 밀린다
  await expect(page.locator('.quiz-opt-mean')).toHaveCount(0)
  expect(await overflow()).toBeLessThanOrEqual(0)
  expect((await page.locator('.quiz-opts').boundingBox())!.height).toBe(heightBefore)
  // 점수·축하 문구 없음
  await expect(page.locator('.quiz-card .verdict')).toHaveCount(0)
  await expect(page.locator('.quiz-card')).not.toContainText(/정답입니다|맞았|틀렸|축하|점/)

  const nextBtn = page.getByRole('button', { name: '다음', exact: true })
  await expect(nextBtn).toBeVisible()
  // 고른 뒤에는 다시 눌러도 정오답 표시가 바뀌지 않는다(눌러서 담기는 아래 테스트)
  await opts.first().click()
  await expect(page.locator('.quiz-opt.is-ng')).toHaveCount(1)

  // Enter 로 문항 2 — 읽기가 바뀐다
  await page.keyboard.press('Enter')
  await expect(page.locator('.quiz-card .headword')).not.toHaveText(reading1)

  // 문항 2 — 정답을 고르면 ✗ 가 하나도 없다. 두 번째 문항 뒤에는 「계속」
  const reading2 = await page.locator('.quiz-card .headword').innerText()
  const heads2 = await page.locator('.quiz-opt-word [lang="ja"]').allInnerTexts()
  if ((await page.locator('.quiz-card .meaning').count()) === 0) {
    // 마지막 칸은 읽기 고르기일 수 있다 — 표기를 주고 읽기를 고른다. 뜻 줄·담기 안내가 없고 정답은 하나다
    await expect(page.locator('.quiz-hint')).toHaveCount(0)
    const rightReadings = await readingsOf(page, reading2)
    expect(heads2.filter((h) => rightReadings.includes(h))).toHaveLength(1)
    await opts.nth(heads2.findIndex((h) => rightReadings.includes(h))).click()
  } else {
    await expect(page.locator('.quiz-card .meaning')).toBeHidden() // 다음 문항은 다시 가려진다
    await page.getByRole('button', { name: '뜻 보기', exact: true }).click()
    const meaning2 = await page.locator('.quiz-card .meaning').innerText()
    const right2 = await answerHeadwords(page, reading2, meaning2)
    await opts.nth(heads2.findIndex((h) => right2.includes(h))).click()
  }
  await expect(page.locator('.quiz-opt.is-ok')).toHaveCount(1)
  await expect(page.locator('.quiz-opt.is-ng')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '계속', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '다음', exact: true })).toHaveCount(0)

  await page.keyboard.press('Enter')
  await expect(page.locator('.quiz-card')).toHaveCount(0)
  // 퀴즈는 어떤 이벤트도 만들지 않았다
  expect(await reviewCount(page)).toBe(reviews)
})

/** 담기·빼기(`star`) 이벤트를 시간순으로 */
async function starEvents(page: Page): Promise<{ idiomId: string; on: boolean; list?: string; at: number }[]> {
  return page.evaluate(
    () =>
      new Promise<{ idiomId: string; on: boolean; list?: string; at: number }[]>((res) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const all = req.result.transaction('events', 'readonly').objectStore('events').getAll()
          all.onsuccess = () =>
            res(
              (all.result as { type: string; idiomId: string; on: boolean; list?: string; at: number }[])
                .filter((e) => e.type === 'star')
                .sort((a, b) => a.at - b.at),
            )
        }
      }),
  )
}

test('고른 뒤 보기를 누르면 「퀴즈」 묶음에 담기고 ★, 다시 누르면 빠진다 — 안내는 첫 퀴즈에만', async ({ page }) => {
  // iPhone SE + Safari 툴바 높이 — ★ 와 안내 줄이 들어와도 카드 안에서 스크롤이 생기지 않는다
  await page.setViewportSize({ width: 375, height: 553 })
  await startNormal(page)
  await toQuiz(page)
  const overflow = () => page.locator('.quiz-card .card-body').evaluate((e) => e.scrollHeight - e.clientHeight)

  // 고르기 전에는 담기지 않는다 — 누르면 고르는 것이다. 안내는 자리만 지킨다
  await expect(page.locator('.quiz-hint')).toBeHidden()
  const stars0 = (await starEvents(page)).length
  await page.locator('.quiz-opt').first().click()
  expect((await starEvents(page)).length).toBe(stars0)
  await expect(page.locator('.quiz-hint')).toBeVisible()
  const heightAfterPick = (await page.locator('.quiz-opts').boundingBox())!.height

  // 이미 담긴 표현은 ★ 로 시작한다(담은 여섯이 이 문항의 재료다). 담기지 않은 보기를 눌러 담는다
  const before = await page.locator('.quiz-opt-star').count()
  const plainAt = await page
    .locator('.quiz-opt')
    .evaluateAll((els) => els.findIndex((e) => e.querySelector('.quiz-opt-star') === null))
  expect(plainAt).toBeGreaterThanOrEqual(0)
  const plain = page.locator('.quiz-opt').nth(plainAt)
  const head = await plain.locator('[lang="ja"]').innerText()
  await plain.click()
  await expect(page.locator('.quiz-opt-star')).toHaveCount(before + 1)
  await expect(plain.locator('.quiz-opt-star')).toHaveCount(1)
  await expect(plain).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(async () => (await starEvents(page)).length).toBe(stars0 + 1)
  const added = (await starEvents(page)).at(-1)!
  expect(added.on).toBe(true)
  expect(added.list).toBe('퀴즈')
  // ★ 가 붙어도 보기 영역 높이는 그대로고 넘침이 없다
  expect((await page.locator('.quiz-opts').boundingBox())!.height).toBe(heightAfterPick)
  expect(await overflow()).toBeLessThanOrEqual(0)

  // 다시 누르면 빠진다 — 마지막 이벤트가 이긴다
  await plain.click()
  await expect(page.locator('.quiz-opt-star')).toHaveCount(before)
  await expect.poll(async () => (await starEvents(page)).length).toBe(stars0 + 2)
  const removed = (await starEvents(page)).at(-1)!
  expect(removed.on).toBe(false)
  expect(removed.idiomId).toBe(added.idiomId)
  expect(head).not.toBe('')

  // 다음 문항에도 안내가 같은 자리에 있다. 한 번 보인 뒤에는 기기에 표시가 남는다
  await page.keyboard.press('Enter')
  await page.locator('.quiz-opt').first().click()
  // 마지막 칸이 읽기 고르기면 담기·안내가 없다(보기가 읽기뿐이라 담을 표기가 안 보인다)
  if ((await page.locator('.quiz-meaning').count()) > 0) await expect(page.locator('.quiz-hint')).toBeVisible()
  else await expect(page.locator('.quiz-hint')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('yomenai.quizStarHint'))).toBe('1')
})

test('안내를 본 기기의 퀴즈에는 안내 줄이 없다', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai.quizStarHint', '1')
    } catch {
      /* private mode */
    }
  })
  await startNormal(page)
  await toQuiz(page)
  await page.locator('.quiz-opt').first().click()
  await expect(page.locator('.quiz-hint')).toHaveCount(0)
})

test('건너뛰기 한 탭이면 문항을 풀지 않고 다음 카드로 간다 — 이벤트도 없다', async ({ page }) => {
  await startNormal(page)
  const done = await toQuiz(page)
  const before = await eventCount(page)
  const at = parseCount(await countText(page))

  // 건너뛰기는 첫 화면에서 곧바로 보인다
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click()
  await expect(page.locator('.quiz-card')).toHaveCount(0)
  await expect.poll(async () => parseCount(await countText(page))).toEqual({ index: at.index + 1, total: 20 })
  expect(await eventCount(page)).toBe(before)

  // 소요 시간이 기기에 한 줄 남는다 (화면 표시는 아직 없다)
  const times = await page.evaluate(() => JSON.parse(localStorage.getItem('yomenai.quizTimes') ?? 'null'))
  expect(Array.isArray(times)).toBe(true)
  expect(times).toHaveLength(1)
  expect(typeof times[0]).toBe('number')

  const rest = await toEnd(page)
  expect(done + rest).toBe(19)
  await expect.poll(() => reviewCount(page)).toBe(19)
})

test('한 문항을 푼 뒤에도 건너뛸 수 있다', async ({ page }) => {
  await startNormal(page)
  await toQuiz(page)
  const before = await eventCount(page)
  await page.locator('.quiz-opt').first().click()
  await page.getByRole('button', { name: '건너뛰기', exact: true }).click()
  await expect(page.locator('.quiz-card')).toHaveCount(0)
  expect(await eventCount(page)).toBe(before)
})

test('퀴즈 화면에는 포커스된 입력창이 없고, 퀴즈 뒤 읽기 카드는 입력창 포커스가 돌아온다', async ({ page }) => {
  await startNormal(page)
  await toQuiz(page)
  await expect(page.locator('.kana-input')).toHaveCount(0)
  const focused = await page.evaluate(() => document.activeElement?.tagName ?? '')
  expect(['INPUT', 'TEXTAREA']).not.toContain(focused)
  await expect(page.locator('input:focus, textarea:focus')).toHaveCount(0)

  await page.getByRole('button', { name: '건너뛰기', exact: true }).click()
  // 다음 카드가 읽기 카드면 입력창이 바로 포커스를 잡는다 (뜻 카드면 이 줄은 건너뛴다)
  const input = page.locator('.kana-input')
  if (await input.isVisible().catch(() => false)) await expect(input).toBeFocused()
  else await expect(page.locator('.card')).toBeVisible()
})

test('퀴즈의 일본어 요소에는 lang="ja" 가 붙고 일본어 폰트 스택을 쓴다', async ({ page }) => {
  await startNormal(page)
  await toQuiz(page)
  await page.locator('.quiz-opt').first().click() // 뜻 줄까지 드러난 상태로 훑는다

  const scan = await page.evaluate(() => {
    const JA = /[々〆ー぀-ヿ㐀-䶿一-鿿]/
    const stray: string[] = []
    let seen = 0
    const card = document.querySelector('.quiz-card')!
    const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
      const text = (n.textContent ?? '').trim()
      if (text === '' || !JA.test(text)) continue
      seen++
      if (n.parentElement?.closest('[lang="ja"]') === null) stray.push(text)
    }
    const fonts = [...card.querySelectorAll('[lang="ja"]')].map((e) => getComputedStyle(e).fontFamily)
    return { seen, stray, fonts }
  })
  // 읽기 1 + 보기 3~4 — 하나도 못 봤으면 검사가 헛돈 것이다
  expect(scan.seen).toBeGreaterThanOrEqual(4)
  expect(scan.stray).toEqual([])
  for (const f of scan.fonts) expect(f).toContain('Noto Sans JP')
})

test('읽기 고르기의 히라가나 보기는 칸을 넘치지 않는다 — 좁은 화면에서도', async ({ page }) => {
  // iPhone SE 1세대 폭 + Safari 툴바 높이
  await page.setViewportSize({ width: 320, height: 553 })
  await startNormal(page)
  await toQuiz(page)
  await page.locator('.quiz-opt').first().click()
  await page.keyboard.press('Enter')
  // 마지막 칸이 표기 고르기로 채워진 날은 검사할 것이 없다
  if ((await page.locator('.quiz-meaning').count()) > 0) return
  await page.locator('.quiz-opt').nth(1).click() // 고른 뒤 ✓·✗ 표시가 붙은 상태까지 본다
  const over = await page.locator('.quiz-opt').evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).length)
  expect(over).toBe(0)
  const rows = await page.locator('.quiz-opt').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
  expect(Math.max(...rows)).toBeLessThan(60) // 줄이 바뀌면 칸이 두 줄 높이로 자란다
  expect(await page.locator('.quiz-card .card-body').evaluate((e) => e.scrollHeight - e.clientHeight)).toBeLessThanOrEqual(0)
})

/**
 * 취약 음독이 잡히고 재대결 후보가 되도록 틀린 기록을 심는다. **방금 틀린 것**으로 심는다 — 기한이 아직 안 온
 * 카드(`due: false`)여야 퀴즈 자리(단독 신규 카드)가 날 수 있어, 게이트(`kind !== 'normal'`)가 빠지면 이 검사가 깨진다
 */
function wrongRows(ids: string[], prefix: string) {
  return ids.map((idiomId, i) => ({
    id: `${prefix}-${i}`, userId: 'local', deviceId: 'e2e', at: Date.now() - 5000 - i,
    idiomId, cardType: 'reading', mistakeType: 'ONYOMI_CHOICE', deletedAt: null,
    type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
  }))
}

test('재대결 세션에는 퀴즈가 없다', async ({ page }) => {
  await ready(page)
  await putEvents(page, [...QUIZ_IDS.map(star), ...wrongRows(QUIZ_IDS, 'quiz-wrong')])
  await page.reload()
  await page.getByRole('button', { name: /재도전/ }).click()
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })

  let ended = false
  for (let i = 0; i < 200; i++) {
    const s = await step(page)
    expect(s, '재대결에 퀴즈가 섰다').not.toBe('quiz')
    if (s === 'done') {
      ended = true
      break
    }
  }
  expect(ended).toBe(true)
})

/**
 * 大 だい(5)·たい(18) 를 쓰는 숙어 — 모두 퀴즈 문항이 되는 동음이의 표현이다. 대조 세션이 이것들로 차면
 * 게이트(`kind !== 'normal'`)가 빠질 때 퀴즈가 설 수 있다. 사람 じん 12개는 읽기 30회 하한을 채우는 밑돈이다
 */
const DAI_IDS = [
  '1178290', '1196250', '1236450', '1414470', '1414480', '1413150', '1413170', '1413180', '1413200', '1413480',
  '1413650', '1413880', '1413920', '1413980', '1414100', '1414140', '1414250', '1581510', '1661030', '1785700',
  '1785860', '1786210', '1787180',
]

test('집중(대조) 세션에는 퀴즈가 없다', async ({ page }) => {
  await ready(page)
  const padding = await page.evaluate(async () => {
    const dict = (await (await fetch('/dict/base.json')).json()) as {
      idioms: { id: string; pairIds: string[] }[]
    }
    return dict.idioms.filter((i) => i.pairIds.includes('人:on:じん')).slice(0, 12).map((i) => i.id)
  })
  expect(padding).toHaveLength(12)
  await putEvents(page, wrongRows([...DAI_IDS, ...padding], 'quiz-focus'))

  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.report .rx-list')).toBeVisible({ timeout: 20_000 })
  const rx = page.locator('.rx-list > li').filter({
    has: page.getByRole('button', { name: '두 음독을 갈라 풀기' }),
  })
  await rx.filter({ hasText: '大' }).getByRole('button', { name: '두 음독을 갈라 풀기' }).click()
  await expect(page.locator('.study-bar')).toBeVisible({ timeout: 15_000 })

  let ended = false
  for (let i = 0; i < 200; i++) {
    const s = await step(page)
    expect(s, '집중 세션에 퀴즈가 섰다').not.toBe('quiz')
    if (s === 'done') {
      ended = true
      break
    }
  }
  expect(ended).toBe(true)
})
