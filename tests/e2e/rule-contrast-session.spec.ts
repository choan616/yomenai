// 리포트 MISTAKE_RULE 처방 → 대조 세션 진입 (2026-10-07, 교수자 관점 보완 D).
//
// contrast-session.spec.ts 와 같은 이유로 무작위 대신 기록을 심는다 — 실기기 표본에 기대면
// 표적 숙어가 두 표면형을 다 가졌는지가 운에 달린다. 発:on:はつ 는 발:ㄹ 받침이 つ 로 굳는
// 꼬리라 뒤에 오는 글자에 따라 はつ(発言)·はっ(発達) 로 갈린다 — decisions.md 가 든 예시다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

async function initPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
}

/** idiomIds 를 SOKUON 오답(또는 correct=true 면 정답)으로 심는다. 같은 id 가 반복돼도 된다 */
async function seedReadingEvents(
  page: Page,
  idiomIds: string[],
  opts: { correct: boolean },
): Promise<void> {
  await page.evaluate(
    ({ idiomIds, correct }) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          idiomIds.forEach((idiomId, i) => {
            store.put({
              id: `rule-rx-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 + i,
              idiomId,
              cardType: 'reading',
              mistakeType: correct ? null : 'SOKUON',
              deletedAt: null,
              type: 'review',
              grade: correct ? 3 : 1,
              answer: correct ? 'x' : 'y',
              expected: 'x',
              correct,
              elapsedMs: 1000,
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    { idiomIds, correct: opts.correct },
  )
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.report')).toBeVisible({ timeout: 20_000 })
}

/** 열린 세션의 앞 n 장의 표기를 걷는다 (소개 장도 표기는 보인다). 중복은 접는다 */
async function walkHeadwords(page: Page, n: number): Promise<string[]> {
  const heads: string[] = []
  for (let i = 0; i < n; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    const head = await page.locator('.headword').first().evaluate((el) => {
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('rt').forEach((rt) => rt.remove())
      return (clone.textContent ?? '').trim()
    })
    if (heads[heads.length - 1] !== head) heads.push(head)
    if (await clickIfVisible(page, '봤어요')) {
      await page.waitForTimeout(60)
      continue
    }
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('tadashii')
      await input.press('Enter')
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(60)
      continue
    }
    await page.waitForTimeout(60)
  }
  return heads
}

/** headword → reading. 기본 사전에서 찾는다 (contrast-session.spec.ts 와 같은 방식) */
async function readingsOf(page: Page, heads: string[]): Promise<string[]> {
  return page.evaluate(async (words) => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { headword: string; reading: string }[] }
    return words.map((w) => dict.idioms.find((i) => i.headword === w)?.reading ?? '')
  }, heads)
}

/** 읽기 목록에서 두 접두 표면형(prefixA·prefixB)이 인접(연속 두 장)해 나오는 자리가 있나 */
function hasAdjacentContrast(readings: string[], prefixA: string, prefixB: string): boolean {
  const formOf = (r: string): string | null =>
    r.startsWith(prefixA) ? prefixA : r.startsWith(prefixB) ? prefixB : null
  const forms = readings.map(formOf)
  for (let i = 0; i < forms.length - 1; i++) {
    if (forms[i] && forms[i + 1] && forms[i] !== forms[i + 1]) return true
  }
  return false
}

// 発:on:はつ 를 쓰고 発 가 첫 글자인 숙어 30개(id 순). はつ(言·現·育·煙·音·芽·情·電)와
// はっ(火·覚·刊·汗·揮…)가 섞여 있다 — data/dict/base.json 실측
const SOKUON_IDIOM_IDS = [
  '1477140', '1477150', '1477170', '1477180', '1477190', '1477200', '1477210', '1477220',
  '1477250', '1477270', '1477290', '1477300', '1477310', '1477340', '1477350', '1477360',
  '1477380', '1477390', '1477450', '1477480', '1477490', '1477500', '1477520', '1477540',
  '1477550', '1477560', '1477620', '1477650', '1477660', '1477670',
]

test('① 촉음 오답을 심으면 규칙 처방에 대조 버튼이 뜬다', async ({ page }) => {
  await initPage(page)
  await seedReadingEvents(page, SOKUON_IDIOM_IDS, { correct: false })

  const rx = page.locator('.rx-list > li').filter({
    has: page.getByRole('button', { name: '이 경계를 갈라 풀기' }),
  })
  await expect(rx).toHaveCount(1)
  // 기존 「이 규칙 읽기」는 그대로 남아 있다
  await expect(rx.getByRole('button', { name: '이 규칙 읽기' })).toBeVisible()
})

test('② 누르면 세션이 열리고 촉음이 생기는 말과 안 생기는 말이 인접해 나온다', async ({ page }) => {
  await initPage(page)
  await seedReadingEvents(page, SOKUON_IDIOM_IDS, { correct: false })

  const rx = page.locator('.rx-list > li').filter({
    has: page.getByRole('button', { name: '이 경계를 갈라 풀기' }),
  })
  await rx.getByRole('button', { name: '이 경계를 갈라 풀기' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 15_000 })

  const heads = await walkHeadwords(page, 10)
  const readings = await readingsOf(page, heads)
  expect(
    hasAdjacentContrast(readings, 'はっ', 'はつ'),
    `열린 순서: ${heads.join(' ')} (${readings.join(' ')})`,
  ).toBe(true)
})

test('③ 기록이 없으면 버튼이 없다', async ({ page }) => {
  await initPage(page)
  // 표본은 쌓이지만(PRESCRIPTION_MIN_READINGS=30 에 못 미치는 20개) 전부 정답이라 지배적 오답이 없다
  await seedReadingEvents(page, SOKUON_IDIOM_IDS.slice(0, 20), { correct: true })

  await expect(page.locator('.rx-list')).toBeVisible()
  await expect(page.getByRole('button', { name: '이 경계를 갈라 풀기' })).toHaveCount(0)
})

test('대조군 — 표적을 한쪽 표면형으로만 묶으면 인접 판정이 실패한다', async ({ page }) => {
  // 疾病 しっぺい(id 1320600)만 반복해 틀린다. 疾:on:しつ 를 쓰는 코퍼스 전체(5개: 疾患·疾走·
  // 疾病・疾風・疾駆)가 하나같이 「しっ」로만 시작하고, 病:on:へい 는 이 숙어 하나뿐이라 다른
  // 표면형이 섞여 들어올 통로가 없다(data/dict/base.json 실측) — 검사가 못 읽으면 여기서 걸린다
  await initPage(page)
  await seedReadingEvents(page, Array(30).fill('1320600'), { correct: false })

  const rx = page.locator('.rx-list > li').filter({
    has: page.getByRole('button', { name: '이 경계를 갈라 풀기' }),
  })
  await expect(rx).toHaveCount(1)
  await rx.getByRole('button', { name: '이 경계를 갈라 풀기' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 15_000 })

  const heads = await walkHeadwords(page, 10)
  const readings = await readingsOf(page, heads)
  expect(
    hasAdjacentContrast(readings, 'しっ', 'しつ'),
    `대조군인데 인접 판정이 성공했다 — 검사가 못 읽고 있다. 열린 순서: ${heads.join(' ')} (${readings.join(' ')})`,
  ).toBe(false)
})
