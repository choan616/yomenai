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
  // 홈이 설 때까지 기다린다 — 사전이 큰 데다 전체 스펙을 이어 돌리면 첫 그림이 늦어,
  // 바로 탭을 누르면 클릭이 테스트 제한(120초)까지 기다리다 깨진다 (2026-10-06 실측)
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 60_000 })
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

  // 첫 말(앱) → 내 말 → 앱의 답. **앱이 이을 말이 없으면 그 자리에서 판이 끝나고
  // 결과 화면이 놀이 화면을 덮는다** (2026-10-06) — 말 목록도 머리말 개수도 그때는 없다
  const over = page.locator('.shiritori-over')
  if ((await over.count()) > 0) {
    await expect(over.locator('.summary-num')).toHaveText('1')
    return
  }
  await expect(page.locator('.chain-item.me .chain-word')).toHaveText(mine.headword)
  await expect(page.locator('.chain-item.me .chain-reading')).toHaveText(mine.reading)
  await expect(page.locator('.chain-item')).toHaveCount(3)
  await expect(page.locator('.count')).toHaveText('1개')
})

// 상대가 답을 치는 중으로 보인다 (2026-10-09 사용자 「상대의 글 입력이 너무 빨라서 어리둥절하다」)
test('내 말이 붙은 뒤 상대는 입력 중 표시를 거쳐 말을 낸다', async ({ page }) => {
  await open(page)
  const need = tail(await lastWord(page))
  const starts = BASE.filter((w) => [...w.headword][0] === need)
  const mine = starts.find((w) => w.reading.length >= 2 && starts.filter((x) => x.reading === w.reading).length === 1)!
  await page.locator('.kana-input').fill(mine.reading)
  await page.locator('.kana-input').press('Enter')

  // 앱이 이을 말이 없으면 입력 중 없이 바로 끝난다 — 그 판은 이 시험의 대상이 아니다
  if ((await page.locator('.shiritori-over').count()) > 0) return

  const typing = page.locator('.chain-item.typing')
  await expect(typing).toBeVisible()
  await expect(page.locator('.chain-item')).toHaveCount(3) // 첫 말 · 내 말 · 입력 중 표시
  await expect(page.locator('.chain-item.me .chain-word')).toHaveText(mine.headword)
  // 치는 동안 이어야 할 한자는 숨고, 힌트·그만하기는 눌리지 않는다
  await expect(page.locator('.shiritori-need')).toBeHidden()
  await expect(page.getByRole('button', { name: '그만하기' })).toBeDisabled()

  // 끝나면 표시가 말로 바뀐다 (최대 2초)
  await expect(typing).toHaveCount(0, { timeout: 4_000 })
  await expect(page.locator('.chain-item')).toHaveCount(3)
  await expect(page.locator('.chain-item.app')).toHaveCount(2)
  await expect(page.locator('.shiritori-need')).toBeVisible()
  await expect(page.getByRole('button', { name: '그만하기' })).toBeEnabled()
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

test('판이 끝나면 결과 화면이 뜨고, 나온 말을 카드로 보며 단어장에 담는다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  const need = tail(await lastWord(page))
  const starts = BASE.filter((w) => [...w.headword][0] === need)
  const mine = starts.find(
    (w) => w.reading.length >= 2 && starts.filter((x) => x.reading === w.reading).length === 1,
  )!
  await page.locator('.kana-input').fill(mine.reading)
  await page.locator('.kana-input').press('Enter')
  // 앱이 못 이으면 그 자리에서 끝나 결과 화면이 덮는다 — 아직 놀고 있을 때만 개수를 잰다
  const quit = (await page.getByRole('button', { name: '그만하기' }).count()) > 0
  if (quit) {
    await expect(page.locator('.count')).toHaveText('1개')
    await page.getByRole('button', { name: '그만하기' }).click()
  }

  // 결과는 별도 화면이다 — 놀이 화면(말 목록·입력)은 접힌다
  const over = page.locator('.shiritori-over')
  await expect(over.getByRole('heading', { name: '끝말잇기 완료' })).toBeVisible()
  await expect(page.locator('.chain-item')).toHaveCount(0)
  await expect(page.locator('.kana-input')).toHaveCount(0)

  // 승패를 먼저 말하고, 이은 수는 한 문장이다 (2026-10-06)
  // 내가 그만둔 판은 졌고, 앱이 못 이어 끝난 판은 이겼다
  await expect(over.locator('.shiritori-verdict')).toHaveText(quit ? '내가 졌어요' : '내가 이겼어요')
  await expect(over.locator('.shiritori-count')).toHaveText('1개를 이었어요')
  await expect(over.locator('.summary-num')).toHaveText('1')
  await expect(over.locator('.shiritori-why')).toHaveCount(quit ? 0 : 1)
  if (!quit) await expect(over.locator('.shiritori-why')).toHaveText('더 이을 말이 없어요')

  // 나온 말 카드 — 이어진 말 전부가 순서대로, 뜻과 함께
  const cards = await page.getByRole('button', { name: /나온 말 \d+개 보기/ }).innerText()
  const n = Number(cards.match(/\d+/)![0])
  expect(n).toBeGreaterThanOrEqual(2)
  await page.getByRole('button', { name: /나온 말 \d+개 보기/ }).click()
  await expect(page.locator('.wl-deck .browse-slide')).toHaveCount(n, { timeout: 60_000 })
  await expect(page.locator('.browse-slide').first().locator('.tag').first()).toHaveText('앱이 낸 말')
  await expect(page.locator('.browse-slide').first().locator('.meaning')).toBeVisible()

  // 「지금 담는 묶음」이 다른 묶음이어도 여기서 담으면 끝말잇기 묶음으로 간다 (2026-10-07)
  await page.evaluate(() => localStorage.setItem('yomenai:wordlistCurrent', '소설 B'))

  // 담기 — 카드마다 제 버튼이 카드 맨 아래에 있다
  const first = page.locator('.browse-slide').first()
  const add = first.getByRole('button', { name: '단어장에 담기' })
  await expect(add).toHaveText('+ 단어장')
  await add.click()
  await expect(first.getByRole('button', { name: '단어장에서 빼기' })).toHaveText('담았어요')

  // 마지막 장의 주 버튼은 「닫기」다 (2026-10-06) — 누르면 결과로 돌아온다
  await page.evaluate((count) => {
    const el = document.querySelector('.wl-deck .browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = (count - 1) * el.clientWidth
  }, n)
  await expect(page.locator('.wl-deck .count')).toContainText(`${n} / ${n}`)
  await expect(page.getByRole('button', { name: '다음 ›' })).toHaveCount(0)
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(over.getByRole('heading', { name: '끝말잇기 완료' })).toBeVisible()

  // ✕ 로도 결과로 돌아온다
  await page.getByRole('button', { name: /나온 말 \d+개 보기/ }).click()
  await expect(page.locator('.wl-deck .browse-slide').first()).toBeVisible({ timeout: 60_000 })
  await page.getByRole('button', { name: '카드 닫기' }).click()
  await expect(over.getByRole('heading', { name: '끝말잇기 완료' })).toBeVisible()
  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.locator('.review-row')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.locator('.wl-group .section-title')).toHaveCount(1)
  await expect(page.locator('.wl-group .section-title')).toContainText('끝말잇기')
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
  await expect(page.getByText(/\d+\/\d+쌍 숙달/)).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: /한자 끝말잇기/ })).toHaveCount(0)
})

test('이은 개수가 기록으로 남아 결과 화면과 리포트 도구 줄에 보인다', async ({ page }) => {
  await open(page)
  const need = tail(await lastWord(page))
  const starts = BASE.filter((w) => [...w.headword][0] === need)
  const mine = starts.find((w) => w.reading.length >= 2 && starts.filter((x) => x.reading === w.reading).length === 1)!
  await page.locator('.kana-input').fill(mine.reading)
  await page.locator('.kana-input').press('Enter')

  // 앱이 이을 말이 없으면 그 자리에서 판이 끝나 **결과 화면이 놀이 화면을 덮는다**
  // (2026-10-06) — 머리말의 개수는 그때 사라지므로 아직 놀고 있을 때만 잰다
  if ((await page.getByRole('button', { name: '그만하기' }).count()) > 0) {
    await expect(page.locator('.count')).toHaveText('1개')
    await page.getByRole('button', { name: '그만하기' }).click()
  }
  await expect(page.locator('.shiritori-record')).toHaveText('새 기록이에요! 최고 1개 · 1판')

  // 한 개도 못 이은 판은 판으로 안 센다
  await page.getByRole('button', { name: '다시 하기' }).click()
  await page.getByRole('button', { name: '그만하기' }).click()
  await expect(page.locator('.shiritori-record')).toHaveText('최고 1개 · 1판')

  await page.getByRole('button', { name: '나가기', exact: true }).click()
  await expect(page.getByRole('button', { name: /한자 끝말잇기/ })).toContainText('최고 1개 · 1판')
})
