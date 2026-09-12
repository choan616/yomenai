// 훑어보기 검증 — 리포트에서 들어가 캐러셀로 넘겨 본다 (사용자 요청 2026-09-12).
// 손가락 제스처 자체는 브라우저 몫이라, 여기선 스냅 설정과 스크롤↔머리말 동기화를 본다.
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true })
test.setTimeout(240_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

/** 트랙을 n 번째 장으로 직접 스크롤한다 (손가락 대신) */
async function scrollToSlide(page: Page, n: number): Promise<void> {
  await page.evaluate((i) => {
    const el = document.querySelector('.browse-track')
    if (el === null) throw new Error('.browse-track 없음')
    el.scrollLeft = i * el.clientWidth
  }, n)
}

test('훑어보기가 스냅되는 캐러셀이다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    try {
      localStorage.clear()
    } catch {
      /* private mode */
    }
    return new Promise<void>((res) => {
      const r = indexedDB.deleteDatabase('yomenai')
      r.onsuccess = r.onerror = r.onblocked = () => res()
    })
  })
  await page.reload()

  // 세션을 전부 틀리며 완주해 훑어볼 카드를 쌓는다
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })
  for (let i = 0; i < 160; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '알고 있었다')) continue
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('tadashii')
      await input.press('Enter')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '뜻 보기')) continue
    if (await clickIfVisible(page, '알았어요')) continue
    await page.waitForTimeout(30)
  }
  await page.getByRole('button', { name: '홈으로' }).click()
  await page.getByRole('button', { name: /진단 리포트/ }).click()
  const enter = page.getByRole('button', { name: /훑어보기 \d+장/ })
  const label = await enter.innerText()
  const total = Number(/(\d+)장/.exec(label)?.[1])
  await enter.click()

  const track = page.locator('.browse-track')
  await expect(track).toBeVisible()
  const slides = page.locator('.browse-slide')
  const count = page.locator('.browse-screen .count')

  // 모든 장이 한 트랙에 들어 있다 — 캐러셀이라 한 장씩 갈아끼우지 않는다
  expect(total).toBeGreaterThan(1)
  await expect(slides).toHaveCount(total)
  await expect(count).toContainText(`1 / ${total}`)

  // 가로 스냅이 걸려 있다
  const snap = await track.evaluate((el) => getComputedStyle(el).scrollSnapType)
  expect(snap).toContain('x')
  const align = await slides.first().evaluate((el) => getComputedStyle(el).scrollSnapAlign)
  expect(align).toBe('center')

  // 트랙을 스크롤하면 머리말이 따라온다
  await scrollToSlide(page, 2)
  await expect(count).toContainText(`3 / ${total}`)
  await scrollToSlide(page, 0)
  await expect(count).toContainText(`1 / ${total}`)

  // 넘김 버튼은 트랙 밖에 한 벌뿐이고, 눌러도 자리가 안 바뀐다
  const nav = page.locator('.browse-nav')
  const prev = nav.getByRole('button', { name: '‹ 이전' })
  const next = nav.getByRole('button', { name: '다음 ›' })
  await expect(nav).toHaveCount(1)
  await expect(slides.locator('.card-bottom')).toHaveCount(0)
  const navBox = await nav.boundingBox()

  await expect(prev).toBeDisabled()
  await next.click()
  await expect(count).toContainText(`2 / ${total}`)
  await expect(prev).toBeEnabled()
  await prev.click()
  await expect(count).toContainText(`1 / ${total}`)
  await expect(prev).toBeDisabled()
  expect(await nav.boundingBox()).toEqual(navBox)

  // 출제 요소는 없다
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '알았어요' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '뜻 보기' })).toHaveCount(0)

  // 첫 장에 읽기·뜻이 있고, 예문은 몇 장 안에 적어도 한 번 붙는다
  const first = slides.first()
  await expect(first.locator('.headword')).not.toBeEmpty()
  await expect(first.locator('.reading-shown')).not.toBeEmpty()
  expect(await slides.locator('.browse-ex').count()).toBeGreaterThan(0)

  // 예문은 카드마다 한 줄씩만 뜬다
  for (let i = 0; i < (await slides.count()); i++) {
    expect(await slides.nth(i).locator('.browse-ex').count()).toBeLessThanOrEqual(1)
  }

  // 「다음 예문」 — 예문이 여럿인 카드로 옮겨 가서 본다 (화면에 보이는 카드에서만 누를 수 있다)
  let withMore = -1
  for (let i = 0; i < total; i++) {
    if ((await slides.nth(i).locator('.browse-ex-more').count()) > 0) {
      withMore = i
      break
    }
  }
  expect(withMore).toBeGreaterThanOrEqual(0)

  await scrollToSlide(page, withMore)
  await expect(count).toContainText(`${withMore + 1} / ${total}`)
  const slide = slides.nth(withMore)
  const more = slide.locator('.browse-ex-more')
  const ex = slide.locator('.browse-ex')
  const before = await ex.innerText()
  const moreLabel = await more.innerText()
  const senses = Number(/\/(\d+)/.exec(moreLabel)?.[1] ?? '1')
  expect(senses).toBeGreaterThan(1)

  // 누르면 그 카드의 예문만 바뀌고 카드는 안 움직인다
  await more.click()
  await expect(ex).not.toHaveText(before)
  await expect(count).toContainText(`${withMore + 1} / ${total}`)

  // 한 바퀴 돌면 첫 예문으로
  for (let i = 1; i < senses; i++) await more.click()
  await expect(ex).toHaveText(before)

  // 카드를 떠났다 돌아오면 첫 예문으로 되돌아간다
  await more.click()
  await expect(ex).not.toHaveText(before)
  const away = withMore === 0 ? 1 : 0
  await scrollToSlide(page, away)
  // 도착을 확인하고 돌아온다 — 연속으로 scrollLeft 를 쓰면 스크롤 이벤트가 합쳐져 안 거친다
  await expect(count).toContainText(`${away + 1} / ${total}`)
  await scrollToSlide(page, withMore)
  await expect(count).toContainText(`${withMore + 1} / ${total}`)
  await expect(ex).toHaveText(before)

  // 리포트엔 목록이 없다 — 진입 버튼 하나뿐
  await expect(page.locator('.browse-row')).toHaveCount(0)

  // 나가면 홈이 아니라 리포트로 돌아온다
  await page.getByRole('button', { name: '훑어보기 나가기' }).click()
  await expect(page.locator('.report')).toBeVisible()

  // 들어갈 때마다 섞인다 — 같은 후보라도 순서가 달라진다
  // 진입 직후엔 아직 불러오는 중이라 슬라이드가 없다 — 다 그려진 뒤에 읽는다
  const order = async () => {
    await expect(slides).toHaveCount(total)
    return slides.locator('.headword').allInnerTexts()
  }
  await page.getByRole('button', { name: /훑어보기 \d+장/ }).click()
  const runA = await order()
  await page.getByRole('button', { name: '훑어보기 나가기' }).click()
  await expect(page.locator('.report')).toBeVisible()
  await page.getByRole('button', { name: /훑어보기 \d+장/ }).click()
  const runB = await order()
  expect(runA).toHaveLength(total)
  expect(runB).not.toEqual(runA)
})
