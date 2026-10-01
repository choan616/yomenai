// 홈·리포트가 탭을 다시 열 때 덜컥거리지 않는지 (2026-09-21 사용자 실기기 지적).
//
// 두 가지를 본다. 돌아왔을 때 로딩 문구가 아예 안 뜨는 것(캐시), 그리고 첫 계산 중에도
// 제목과 주 버튼이 안 움직이는 것(자리 예약).
import { expect, test, type Page } from '@playwright/test'

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } })

async function ready(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.reload()
}

test('탭을 오갔다 와도 로딩 문구가 다시 안 뜬다', async ({ page }) => {
  await ready(page)
  await expect(page.locator('.home-stat')).not.toContainText('불러오는 중', { timeout: 20_000 })

  // 리포트를 한 번 열어 캐시를 채운다
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.report .empty, .report .rows').first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.report')).not.toContainText('불러오고 있어요')

  // CPU 를 조여도 돌아올 때는 계산이 없다
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '홈', exact: true }).click()
    expect(await page.locator('.home-stat').innerText()).not.toContain('불러오는 중')
    await page.getByRole('button', { name: '리포트', exact: true }).click()
    expect(await page.locator('.screen-body').innerText()).not.toContain('불러오고 있어요')
  }
})

/**
 * `withWordlist` — 단어장에 담은 게 있는 기기. 홈 맨 아래 「단어장」 진입로는 계산 뒤에야
 * 개수를 알 수 있어서, 직전 계산의 힌트로 자리를 잡는다 (2026-10-01). 담은 게 없는 기기는
 * 그 자리가 아예 없고, 있는 기기는 계산 전에도 같은 자리를 지켜야 한다
 */
async function titleHoldsStill(page: Page, withWordlist: boolean): Promise<void> {
  await ready(page)
  if (withWordlist) {
    // 홈의 계산이 끝나면 그 결과로 힌트를 다시 쓴다. 끝나기 전에 세우면 덮어써진다
    await expect(page.locator('.home-stat')).not.toContainText('불러오는 중', { timeout: 20_000 })
    await page.evaluate(() => localStorage.setItem('yomenai:wordlistHint', '1'))
  }

  const probe = () =>
    page.evaluate(() => {
      const h1 = document.querySelector('.home h1')
      const primary = document.querySelector('.home .btn-primary.big')
      return {
        loading: (document.querySelector('.home-stat')?.textContent ?? '').includes('불러오는 중'),
        h1: h1 ? Math.round(h1.getBoundingClientRect().top) : -1,
        primary: primary ? Math.round(primary.getBoundingClientRect().top) : -1,
      }
    })

  // **진짜 숙어 id 로 오답을 심는다.** 기록이 없으면 「틀렸던 것」이 로딩 뒤에 접혀서,
  // 예약이 제대로 돼 있어도 화면이 움직인다 — 실사용(오답이 쌓인 상태)과 조건이 다르다
  await page.evaluate(async (withWordlist) => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 20).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        ids.forEach((idiomId, i) => {
          store.put({
            id: `00000${String(i).padStart(3, '0')}-seed`,
            userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'RENDAKU', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        if (withWordlist) {
          store.put({
            id: '00000999-star', userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000,
            idiomId: ids[0], cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'star', on: true,
          })
        }
        tx.oncomplete = () => done()
      }
    })
  }, withWordlist)

  // 사전을 붙잡아 **로딩 상태를 고정한다.** 안 그러면 계산이 너무 빨리 끝나 그 순간을
  // 한 번도 못 보고 테스트가 헛돈다 (실제로 그랬다)
  let release = (): void => {}
  const held = new Promise<void>((res) => {
    release = res
  })
  await page.route('**/dict/base.json', async (route) => {
    await held
    await route.continue()
  })
  await page.reload()

  await page.waitForSelector('.home h1', { timeout: 20_000 })
  const loading = await probe()
  expect(loading.loading, '로딩 상태를 잡아야 의미가 있다').toBe(true)

  release()
  await expect(page.locator('.home-stat')).not.toContainText('불러오는 중', { timeout: 20_000 })
  const loaded = await probe()

  expect(loaded.h1, `제목이 ${loaded.h1 - loading.h1}px 움직였다`).toBe(loading.h1)
  expect(loaded.primary, `주 버튼이 ${loaded.primary - loading.primary}px 움직였다`).toBe(
    loading.primary,
  )
  if (withWordlist) {
    await expect(page.getByRole('button', { name: /^단어장/ })).toBeVisible()
  }
}

test('계산 중에도 제목과 주 버튼이 안 움직인다', async ({ page }) => {
  await titleHoldsStill(page, false)
})

test('단어장에 담은 게 있어도 계산 중에 제목과 주 버튼이 안 움직인다', async ({ page }) => {
  await titleHoldsStill(page, true)
})

test('리포트는 계산 중에 도구를 안 그린다 — 본문이 들어오며 밀려날 것이 없다', async ({ page }) => {
  // 2026-10-01 도구가 본문 아래로 내려갔다. 계산 중에 그려 두면 본문이 들어오며 통째로
  // 밀려 내려간다 — 2026-09-21 이 테스트가 잡던 「보이던 것이 움직이는」 덜컥거림의 새 얼굴이다
  await ready(page)

  // 사전을 붙잡아 로딩 상태를 고정한다 (위와 같은 처방)
  let release = (): void => {}
  const held = new Promise<void>((res) => {
    release = res
  })
  await page.route('**/dict/base.json', async (route) => {
    await held
    await route.continue()
  })
  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()

  await expect(page.locator('.screen-body')).toContainText('불러오고 있어요')
  await expect(page.locator('.report .tools')).toHaveCount(0)

  release()
  await expect(page.locator('.screen-body')).not.toContainText('불러오고 있어요', {
    timeout: 20_000,
  })
  await expect(page.locator('.report .tools')).toBeVisible()
})

test('찾기도 다시 열면 검색창 아래가 바로 차 있다', async ({ page }) => {
  await ready(page)

  // **실사용 규모로 심는다.** 기록이 몇 건이면 재생이 순식간이라 캐시가 있든 없든
  // 통과한다 — 대조군으로 확인했다. 사용자 실기기는 다시보기 대상만 388개다
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 2000).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        ids.forEach((idiomId, i) => {
          store.put({
            id: `0000${String(i).padStart(5, '0')}-seed`,
            userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'RENDAKU', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        tx.oncomplete = () => done()
      }
    })
  })
  await page.reload()

  const open = () => page.getByRole('button', { name: '찾기', exact: true }).click()
  await open()
  await expect(page.locator('.search-scope')).toBeVisible({ timeout: 20_000 })

  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 })

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: '홈', exact: true }).click()
    await open()
    // 돌아온 첫 렌더에 이미 차 있다 — 「불러오고 있어요」를 거치지 않는다
    expect(await page.locator('.screen-body').innerText()).not.toContain('불러오고 있어요')
    await expect(page.locator('.search-scope')).toBeVisible()
  }
})
