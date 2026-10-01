// 단어장 (2026-09-25 사용자 요청 「단어장 기능도 만들고 싶다」).
//
// 못 박는 것 셋 — **학습을 시작해도 안 사라진다**(찾기의 대기열과 다른 점이다),
// 묶음을 만들어 옮길 수 있다, 메모가 남는다.
import { expect, test, type Page } from '@playwright/test'

const DAY = 86_400_000

async function skipIntro(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
}

/** `via` — 단어장에 들어가는 길. 찾기 탭(항상 있다) 또는 홈 진입로(담은 게 있을 때만) */
async function open(page: Page, via: 'search' | 'home' = 'search'): Promise<void> {
  await skipIntro(page)
  // 담아 둔 것 하나 + 그중 하나는 이미 학습을 시작했다
  await page.evaluate(
    (day) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const st = req.result.transaction('events', 'readwrite').objectStore('events')
          st.put({
            id: 'wl-1', userId: 'local', deviceId: 'e2e', at: Date.now() - 2 * day,
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.put({
            id: 'wl-2', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'review', grade: 3, answer: 'x', expected: 'x', correct: true, elapsedMs: 900,
          })
          st.put({
            id: 'wl-3', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1150680', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
          st.transaction.oncomplete = () => res()
          st.transaction.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    DAY,
  )
  await page.reload()
  if (via === 'search') await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible()
}

test('담은 게 있으면 홈에서 바로 들어가고, 뒤로 가면 홈이다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page, 'home')
  // 씨앗은 두 개 — 홈 버튼이 개수를 단다
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.getByRole('button', { name: /^단어장 · 2/ })).toBeVisible()
})

test('담은 게 없으면 홈에 단어장 진입로가 없다', async ({ page }) => {
  await skipIntro(page)
  // 계산이 끝난 뒤에야 「없다」를 말할 수 있다 — 끝나기 전엔 자리만 잡힌 숨은 버튼이다
  await expect(page.locator('.home-stat')).toContainText('이번 세션', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /^단어장/ })).toHaveCount(0)
})

test('학습을 시작해도 단어장에는 남는다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)

  const rows = page.locator('.review-row')
  await expect(rows).toHaveCount(2, { timeout: 60_000 })

  // 찾기의 「담아 둔 표현」은 세션에 나온 순간 사라진다. 여기서는 상태를 달고 남는다
  const started = rows.filter({ hasText: '明白' })
  await expect(started.locator('.wl-state')).toHaveText('학습 중')
  await expect(rows.filter({ hasText: '愛好' }).locator('.wl-state')).toHaveText('아직 안 나옴')
})

test('묶음을 만들어 옮기고, 메모를 남긴다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  await expect(page.locator('.review-row').first()).toBeVisible({ timeout: 60_000 })

  // 처음엔 전부 기본 묶음이다 — 묶음을 안 준 옛 이벤트도 여기로 온다
  await expect(page.locator('.wl-group .section-title')).toHaveCount(1)
  await expect(page.locator('.wl-group .section-title')).toContainText('기본')

  await page.getByRole('button', { name: '+ 새 묶음' }).click()
  await page.getByLabel('새 묶음 이름').fill('소설 A')
  await page.getByRole('button', { name: '만들기' }).click()
  // 새로 만든 묶음이 「지금 담는 묶음」이 된다 — 찾기의 + 가 여기로 들어간다
  await expect(page.locator('.chip.on')).toHaveText('소설 A')

  const row = page.locator('.review-row').filter({ hasText: '明白' })
  await row.locator('select').selectOption('소설 A')
  await expect(page.locator('.wl-group .section-title')).toHaveCount(2)

  await row.getByRole('button', { name: '메모' }).click()
  await page.getByLabel('明白 메모').fill('3장 첫 문단')
  await row.getByRole('button', { name: '저장' }).click()
  await expect(row.locator('.wl-memo')).toContainText('3장 첫 문단')

  // 다시 들어와도 남아 있다 — 새 star 이벤트로 쌓였다는 뜻이다
  await page.reload()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  const again = page.locator('.review-row').filter({ hasText: '明白' })
  await expect(again.locator('.wl-memo')).toContainText('3장 첫 문단', { timeout: 60_000 })
  await expect(page.locator('.wl-group .section-title')).toHaveCount(2)
})

test('묶음 이름을 고치고, 삭제하면 단어는 기본으로 돌아간다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  await expect(page.locator('.review-row').first()).toBeVisible({ timeout: 60_000 })

  await page.getByRole('button', { name: '+ 새 묶음' }).click()
  await page.getByLabel('새 묶음 이름').fill('소설 A')
  await page.getByRole('button', { name: '만들기' }).click()

  const row = page.locator('.review-row').filter({ hasText: '明白' })
  await row.locator('select').selectOption('소설 A')
  await expect(page.locator('.wl-group .section-title')).toHaveCount(2)

  // 이름 고치기 — 단어는 그대로, 묶음 이름·지금 담는 묶음 표시만 바뀐다.
  // 고치는 중에는 제목 자체가 입력창으로 바뀌어 텍스트로 못 찾으니 페이지 전역에서 찾는다
  // (이 시점엔 「기본」묶음엔 이름 고치기 버튼이 없어 유일하다)
  await page.getByRole('button', { name: '이름 고치기' }).click()
  await page.getByLabel('소설 A 묶음 이름').fill('소설 B')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText('소설 B ·')).toBeVisible()
  await expect(page.getByText('소설 A ·')).toHaveCount(0)
  await expect(page.locator('.chip.on')).toHaveText('소설 B')

  // 삭제 — 확인을 거쳐야 하고, 단어는 지워지지 않고 기본 묶음으로 돌아간다
  const groupB = page.locator('.wl-group').filter({ has: page.getByText('소설 B ·') })
  await groupB.getByRole('button', { name: '삭제', exact: true }).click()
  await groupB.getByRole('button', { name: '정말 삭제' }).click()
  await expect(page.locator('.wl-group .section-title')).toHaveCount(1)
  await expect(page.locator('.wl-group .section-title')).toContainText('기본')
  await expect(page.locator('.review-row').filter({ hasText: '明白' })).toBeVisible()
})

test('카드로 보면 요미가나가 가려지고, 넘기면 도로 가려진다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  await page.getByRole('button', { name: '카드', exact: true }).click()

  // 담은 두 개가 카드 두 장이다. 요미가나는 처음부터 가려져 있다
  const slides = page.locator('.wl-deck .browse-slide')
  await expect(slides).toHaveCount(2, { timeout: 60_000 })
  await expect(slides.first().locator('.headword')).toHaveClass(/masked/)
  // 머리 태그는 묶음, 옆은 학습 상태다 (다시보기의 「N회 틀림」이 아니다)
  await expect(slides.first().locator('.card-head')).toContainText('기본')
  await expect(slides.first().locator('.card-head')).not.toContainText('틀림')

  // 벗겼다가 다음 장으로 넘기면 처음 장은 도로 가려진다
  await slides.first().getByRole('button', { name: '읽기 보기' }).click()
  await expect(slides.first().locator('.headword')).not.toHaveClass(/masked/)
  await expect(page.locator('.wl-deck .count')).toHaveText('1 / 2')
  // 「다음 예문」과 겹치지 않게 넘김 버튼만 짚는다
  await page.locator('.wl-deck .browse-nav').getByRole('button', { name: /^다음/ }).click()
  await expect(page.locator('.wl-deck .count')).toHaveText('2 / 2')
  await page.locator('.wl-deck .browse-nav').getByRole('button', { name: /이전/ }).click()
  await expect(page.locator('.wl-deck .count')).toHaveText('1 / 2')
  await expect(slides.first().locator('.headword')).toHaveClass(/masked/)
})

test('고른 보기를 기억해서, 다시 들어가면 그 보기로 열린다', async ({ page }) => {
  test.setTimeout(120_000)
  await open(page)
  // 처음엔 리스트다
  await expect(page.getByRole('button', { name: '리스트', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: '카드', exact: true }).click()
  await expect(page.locator('.wl-deck')).toBeVisible({ timeout: 60_000 })

  await page.reload()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('button', { name: '카드', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('.wl-deck')).toBeVisible({ timeout: 60_000 })

  // 리스트로 돌리면 그 선택도 기억된다
  await page.getByRole('button', { name: '리스트', exact: true }).click()
  await expect(page.locator('.review-row').first()).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect(page.getByRole('button', { name: '리스트', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('최근에 담은 것이 위다 — 오래된 것의 메모를 고쳐도 순서는 그대로다', async ({ page }) => {
  test.setTimeout(120_000)
  // 씨앗: 明白 은 이틀 전에, 愛好 는 하루 전에 담았다 → 愛好 가 위
  await open(page)
  const headwords = () => page.locator('.review-row .r-main').allInnerTexts()
  await expect.poll(headwords, { timeout: 60_000 }).toEqual(['愛好', '明白'])

  // 오래된 明白 의 메모를 고친다 — 새 star 이벤트가 쌓여도 「담은 시각」은 그대로여야 한다
  await page.locator('.review-row', { hasText: '明白' }).getByRole('button', { name: /^메모/ }).click()
  await page.getByLabel('明白 메모').fill('고쳤다')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.locator('.review-row', { hasText: '明白' })).toContainText('고쳤다')

  // 다시 열어도(재생을 새로 돌려도) 순서가 같다
  await page.reload()
  await page.getByRole('button', { name: '찾기', exact: true }).click()
  await page.getByRole('button', { name: /^단어장/ }).click()
  await expect.poll(headwords, { timeout: 60_000 }).toEqual(['愛好', '明白'])

  // 카드 보기도 같은 순서다
  await page.getByRole('button', { name: '카드', exact: true }).click()
  await expect(page.locator('.wl-deck .browse-slide')).toHaveCount(2, { timeout: 60_000 })
  // 한자는 글자마다 루비로 쪼개져 표제어 비교가 안 맞는다 — 카드에 뜨는 뜻으로 가른다(愛好 = 애호)
  await expect(page.locator('.wl-deck .browse-slide').first().locator('.meaning')).toContainText('애호')
  await expect(page.locator('.wl-deck .browse-slide').nth(1).locator('.meaning')).toContainText('분명함')
})
