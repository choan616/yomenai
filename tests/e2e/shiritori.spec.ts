// 한자 끝말잇기 — 리포트 도구에서 열고, 끝 한자로 시작하는 말을 읽기로 이어, 힌트·그만하기·다시 하기·나가기까지 (2026-10-04)
import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'

interface Row {
  headword: string
  reading: string
}
const BASE = (JSON.parse(readFileSync('public/dict/base.json', 'utf8')) as { idioms: Row[] }).idioms

/** 화면의 규칙과 같다 — 々 는 앞 글자가 끝 한자 */
const tail = (headword: string): string => {
  const cs = [...headword]
  let i = cs.length - 1
  while (i > 0 && cs[i] === '々') i--
  return cs[i]!
}

async function open(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
      localStorage.setItem('yomenai:unlock:shiritori', '1') // 레벨 제도 전이라 잠겨 있다 — 개발 빌드의 열쇠로 연다
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await page.getByRole('button', { name: /한자 끝말잇기/ }).click()
  await expect(page.locator('.chain-item')).toHaveCount(1, { timeout: 20_000 })
}

const lastWord = async (page: Page): Promise<string> =>
  (await page.locator('.chain-item .chain-word').last().textContent())!

test('리포트의 도구에서 열리고, 첫 말과 이어야 할 끝 한자가 보인다', async ({ page }) => {
  await open(page)
  const first = await lastWord(page)
  await expect(page.locator('.need-kanji')).toHaveText(tail(first))
  await expect(page.locator('.chain-item.app')).toHaveCount(1)
  await expect(page.locator('.chain-word').first()).toHaveAttribute('lang', 'ja')
})

test('끝 한자로 시작하는 말의 읽기를 치면 이어지고 앱이 답한다', async ({ page }) => {
  await open(page)
  const need = tail(await lastWord(page))
  // 읽기가 유일한 말을 고른다 — 같은 읽기의 말이 둘이면 화면은 더 흔한 쪽을 내기 때문이다
  const starts = BASE.filter((w) => [...w.headword][0] === need)
  const mine = starts.find((w) => w.reading.length >= 2 && starts.filter((x) => x.reading === w.reading).length === 1)!
  await page.locator('.kana-input').fill(mine.reading)
  await page.locator('.kana-input').press('Enter')

  // 첫 말(앱) → 내 말 → 앱의 답. 앱이 이을 말이 없으면 내 말에서 끝나고 결과가 뜬다
  await expect(page.locator('.chain-item.me .chain-word')).toHaveText(mine.headword)
  await expect(page.locator('.chain-item.me .chain-reading')).toHaveText(mine.reading)
  const n = await page.locator('.chain-item').count()
  expect(n === 3 || n === 2).toBe(true)
  if (n === 3) await expect(page.locator('.shiritori-over')).toHaveCount(0)
  await expect(page.locator('.count')).toHaveText('1개')
})

test('그 한자로 시작하는 말에 없는 읽기는 말이 이어지지 않고 안내가 뜬다', async ({ page }) => {
  await open(page)
  const need = tail(await lastWord(page))
  await page.locator('.kana-input').fill('ぬぬぬぬ')
  await page.locator('.kana-input').press('Enter')
  await expect(page.getByRole('status').filter({ hasText: `「${need}」로 시작하는 말 중에 그 읽기가 없어요` })).toBeVisible()
  await expect(page.locator('.chain-item')).toHaveCount(1)
  await expect(page.locator('.count')).toHaveText('0개')
})

test('힌트는 표기만 보이고, 그만하기는 읽기까지 보이며, 다시 하기로 새 판이 열린다', async ({ page }) => {
  await open(page)
  const need = tail(await lastWord(page))

  await page.getByRole('button', { name: '힌트' }).click()
  const hint = await page.locator('.shiritori-hint').textContent()
  for (const h of hint!.split(' · ')) {
    expect([...h][0]).toBe(need)
    expect(h).not.toMatch(/[ぁ-ん]/) // 읽기는 안 보인다
  }

  await page.getByRole('button', { name: '그만하기' }).click()
  await expect(page.locator('.shiritori-over')).toContainText('이런 말이 있어요')
  await expect(page.locator('.shiritori-over')).toContainText('(') // 읽기가 같이 보인다

  await page.getByRole('button', { name: '다시 하기' }).click()
  await expect(page.locator('.chain-item')).toHaveCount(1)
  await expect(page.locator('.shiritori-over')).toHaveCount(0)
})

test('✕ 로 나가면 리포트로 돌아온다', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '끝말잇기 나가기' }).click()
  await expect(page.getByRole('navigation', { name: '주 메뉴' })).toBeVisible()
  await expect(page.getByRole('button', { name: '리포트', exact: true })).toHaveAttribute('aria-current', 'page')
})

test('기록이 없으면 도구 줄에 안 보인다', async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.getByRole('button', { name: /읽기 규칙/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /한자 끝말잇기/ })).toHaveCount(0)
})

/** 어제까지 `days` 일 연속, 하루 3개씩(「3장만」 문턱) 채점 기록을 심는다 */
async function seedStreak(page: Page, days: number): Promise<void> {
  await page.evaluate(
    (days) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          for (let d = 1; d <= days; d++) {
            const at = new Date()
            at.setDate(at.getDate() - d)
            at.setHours(12, 0, 0, 0)
            for (let i = 0; i < 3; i++) {
              store.put({
                id: `streak-${d}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                at: at.getTime() + i,
                idiomId: '1000220',
                cardType: 'reading',
                mistakeType: null,
                deletedAt: null,
                type: 'review',
                grade: 3,
                answer: 'x',
                expected: 'x',
                correct: true,
                elapsedMs: 1000,
              })
            }
          }
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    days,
  )
}

async function reportAfterSeed(page: Page, days: number): Promise<void> {
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
  await seedStreak(page, days)
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.getByRole('button', { name: /읽기 규칙/ })).toBeVisible({ timeout: 20_000 })
}

test('연속 기록이 28일에 닿으면 도구 줄에 열린다 (열쇠 없이, 기록만으로)', async ({ page }) => {
  await reportAfterSeed(page, 28)
  await expect(page.getByRole('button', { name: /한자 끝말잇기/ })).toBeVisible({ timeout: 20_000 })
})

test('27일이면 아직 잠겨 있다', async ({ page }) => {
  await reportAfterSeed(page, 27)
  // 기록 계산이 끝났다는 신호 — 음독 맵 줄의 수치가 채워진다. 그 전에는 어차피 잠겨 있어서 이걸 기다려야 안 열린다는 검사가 의미 있다
  await expect(page.getByText(/한자 읽기 \d+\/\d+쌍 숙달/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /한자 끝말잇기/ })).toHaveCount(0)
})
