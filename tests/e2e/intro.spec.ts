// 시작 인트로 — 하루 첫 실행에만 뜨고, 홈 제목 자리로 내려앉으며, 탭하면 건너뛰고, 모션을 줄이면 안 뜬다 (2026-10-05)
// 개발 서버에서는 기본으로 꺼져 있다(다른 스펙이 시작 화면을 바로 만지므로). 열쇠 `yomenai:intro=1` 로 켠다.
import { expect, test, type Page } from '@playwright/test'

async function prepare(page: Page, on: boolean): Promise<void> {
  await page.addInitScript((on) => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
      if (on) localStorage.setItem('yomenai:intro', '1')
    } catch {
      /* private mode */
    }
  }, on)
}

test('기본(개발 빌드)에서는 인트로가 없다 — 다른 스펙이 시작 화면을 바로 만진다', async ({ page }) => {
  await prepare(page, false)
  await page.goto('/')
  await expect(page.locator('.home h1')).toBeVisible()
  await expect(page.locator('.intro')).toHaveCount(0)
})

test('뜨는 동안 홈 제목은 가려지고, 끝나면 제목이 보이고 인트로는 사라진다', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/')
  await expect(page.locator('.intro')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-intro', '1')
  await expect(page.locator('.home h1')).toBeHidden() // visibility:hidden
  // 장식이라 낭독에서 숨긴다
  await expect(page.locator('.intro')).toHaveAttribute('aria-hidden', 'true')

  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 12_000 })
  await expect(page.locator('html')).not.toHaveAttribute('data-intro', /.*/)
  await expect(page.locator('.home h1')).toBeVisible()
  await expect(page.locator('.home h1')).toHaveText('読めない')
})

test('끝 장면에서 로고가 홈 제목 자리에 내려앉는다 (도착 직전 위치 확인)', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/')
  await expect(page.locator('.intro')).toBeVisible()
  const h1 = page.locator('.home h1')
  const target = (await h1.evaluate((el) => {
    const r = document.createRange()
    r.setStart(el.firstChild!, 0)
    r.setEnd(el.firstChild!, 1)
    const b = r.getBoundingClientRect()
    return { left: b.left, top: b.top }
  })) as { left: number; top: number }
  // 움직임이 끝나기 직전까지 기다렸다가 読 글자가 목표 점에 와 있는지 본다
  await expect(page.locator('.intro-word')).toHaveCSS('transform', /matrix/, { timeout: 12_000 })
  await page.waitForFunction(
    () => {
      const w = document.querySelector('.intro-word') as HTMLElement | null
      if (!w) return true
      const m = new DOMMatrix(getComputedStyle(w).transform)
      return m.a < 0.72 // 크기 비율이 44/64 = 0.6875 에 가까워졌다
    },
    null,
    { timeout: 12_000 },
  )
  const near = await page.evaluate(() => {
    const k = document.querySelector('.intro-word span span') as HTMLElement | null
    if (!k) return null
    const b = k.getBoundingClientRect()
    return { left: b.left, top: b.top }
  })
  if (near) {
    expect(Math.abs(near.left - target.left)).toBeLessThan(40)
    expect(Math.abs(near.top - target.top)).toBeLessThan(40)
  }
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 12_000 })
})

test('도착했을 때 글자 폭이 홈 제목과 같다 — 자간이 어긋나지 않는다', async ({ page }) => {
  await prepare(page, true)
  // 마지막으로 보인 프레임의 글자 칸들 오른쪽 끝을 계속 기록한다
  await page.addInitScript(() => {
    ;(window as unknown as { __w: number[] }).__w = []
    const tick = () => {
      const w = document.querySelector('.intro-word')
      if (w) {
        const spans = [...w.querySelectorAll(':scope > span')].filter((e) => !e.classList.contains('intro-mark'))
        const first = spans[0]!.getBoundingClientRect()
        const last = spans[spans.length - 1]!.getBoundingClientRect()
        if (first.height > 0) (window as unknown as { __w: number[] }).__w.push(last.right - first.left)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('/')
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 15_000 })
  const title = await page.locator('.home h1').evaluate((el) => {
    const r = document.createRange()
    r.selectNodeContents(el)
    const b = r.getBoundingClientRect()
    return b.right - b.left
  })
  const widths = await page.evaluate(() => (window as unknown as { __w: number[] }).__w)
  // 같은 자간이면 도착한 프레임의 폭이 제목 폭과 1px 안쪽이다 (전에는 3.5px 넓었다)
  expect(Math.abs(widths[widths.length - 1]! - title)).toBeLessThan(1)
})

test('같은 날 다시 열면 정적판이 뜬다 — 「読めない」가 가만히 떠 있다가 사라진다', async ({ page }) => {
  await prepare(page, true)
  // 「ない」 칸의 폭을 프레임마다 기록한다 — 정적판은 「読めない」 그대로이고 한 번도 움직이지 않는다(「読める」로 바뀌었다 돌아가는 변화가 없다)
  await page.addInitScript(() => {
    ;(window as unknown as { __nai: number[] }).__nai = []
    const tick = () => {
      const el = document.querySelector('.intro-word .intro-clip')
      if (el) (window as unknown as { __nai: number[] }).__nai.push(el.getBoundingClientRect().width)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  await page.goto('/')
  await expect(page.locator('.intro')).toBeVisible()
  const t0 = Date.now()
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 15_000 })
  const full = Date.now() - t0

  await page.reload()
  await expect(page.locator('.intro')).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-intro', '1')
  // 물음표·느낌표는 보이지 않는다 — 「読めない」만 있다
  await expect(page.locator('.intro-mark')).toBeHidden()
  const t1 = Date.now()
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 8_000 })
  const quick = Date.now() - t1
  await expect(page.locator('.home h1')).toBeVisible()
  // 걷어내는 순간의 숨김(display:none) 프레임은 폭 0 이라 뺀다
  const nai = (await page.evaluate(() => (window as unknown as { __nai: number[] }).__nai)).filter((w) => w > 0)
  expect(nai.length).toBeGreaterThan(10)
  expect(Math.min(...nai)).toBeGreaterThan(20) // 「ない」가 처음부터 끝까지 그대로 있다
  expect(Math.max(...nai) - Math.min(...nai)).toBeLessThan(1) // 폭이 변하지 않는다 = 움직임이 없다
  expect(quick).toBeLessThan(full * 0.4)
  expect(quick).toBeLessThan(2_500)
})

test('탭하면 바로 건너뛴다', async ({ page }) => {
  await prepare(page, true)
  await page.goto('/')
  await expect(page.locator('.intro')).toBeVisible()
  await page.locator('.intro').click()
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 2_000 })
  await expect(page.locator('.home h1')).toBeVisible()
})

test('설정의 「인트로 다시 보기」로 언제든 다시 본다 (하루 한 번 제한과 별개)', async ({ page }) => {
  await prepare(page, false)
  await page.goto('/')
  await expect(page.locator('.home h1')).toBeVisible()
  await expect(page.locator('.intro')).toHaveCount(0)

  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: /인트로 다시 보기/ }).click()
  await expect(page.locator('.intro')).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0) // 설정 시트는 닫혀 있다
  await expect(page.locator('.intro')).toHaveCount(0, { timeout: 12_000 })
  await expect(page.locator('.home h1')).toBeVisible()

  // 몇 번이든 된다
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await page.getByRole('button', { name: /인트로 다시 보기/ }).click()
  await expect(page.locator('.intro')).toBeVisible()
})

test('모션을 줄이는 기기에서는 안 뜬다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await prepare(page, true)
  await page.goto('/')
  await expect(page.locator('.home h1')).toBeVisible()
  await expect(page.locator('.intro')).toHaveCount(0)
})
