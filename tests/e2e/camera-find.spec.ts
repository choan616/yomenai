// 카메라로 찾기 (2026-09-23). 읽는 법을 몰라 막힌 순간에 쓰는 입력 수단이다.
//
// 인식 자체는 단위 검사(`core/ocrMatch.test.ts`)와 실측이 맡는다. 여기서 못 박는 것은
// **화면 쪽**이다 — 초록 네모와 자르는 곳이 같은가, 화면을 나가면 카메라가 꺼지는가,
// 못 켰을 때 무엇을 하면 되는지 말하는가.
import { expect, test, type Page } from '@playwright/test'

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
  permissions: ['camera'],
})

/**
 * **새로고침을 안 한다.** `page.reload()` 를 끼우면 앞서 심은 getUserMedia 갈아 끼우기가
 * 풀려 가짜 기기 스트림(fake_device_0)이 그대로 온다 (실측). 그래서 설정도 init 에서 심는다
 */
async function openCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: '찾기' }).click()
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()
  await page.getByRole('button', { name: '카메라로 찾기' }).click()
  await expect(page.getByRole('heading', { name: '카메라로 찾기' })).toBeVisible()
}

test('찾기에서 한 겹 들어가고, 되돌아오면 카메라가 꺼진다', async ({ page }) => {
  await openCamera(page)
  await page.waitForFunction(
    () => ((document.querySelector('.cam-stage video') as HTMLVideoElement | null)?.videoWidth ?? 0) > 100,
    null,
    { timeout: 20_000 },
  )
  // **트랙이 살아 있다**
  const live = await page.evaluate(() => {
    const v = document.querySelector('.cam-stage video') as HTMLVideoElement
    return (v.srcObject as MediaStream).getVideoTracks().map((t) => t.readyState)
  })
  expect(live).toEqual(['live'])

  // 나가면 꺼야 한다 — 안 끄면 배터리를 먹고 표시등이 계속 켜져 있다
  const handle = await page.evaluateHandle(() => {
    const v = document.querySelector('.cam-stage video') as HTMLVideoElement
    return (v.srcObject as MediaStream).getVideoTracks()[0]!
  })
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()
  expect(await handle.evaluate((t: MediaStreamTrack) => t.readyState)).toBe('ended')
})

test('초록 네모와 실제로 자르는 곳이 같다 — 배율을 올려도', async ({ page }) => {
  await openCamera(page)
  await page.waitForFunction(
    () => ((document.querySelector('.cam-stage video') as HTMLVideoElement | null)?.videoWidth ?? 0) > 100,
    null,
    { timeout: 20_000 },
  )
  for (const zoom of ['1×', '3×']) {
    await page.getByRole('button', { name: zoom, exact: true }).click()
    await page.waitForTimeout(250)
    const geo = await page.evaluate(() => {
      const v = document.querySelector('.cam-stage video') as HTMLVideoElement
      const f = document.querySelector('.cam-frame')!
      const vr = v.getBoundingClientRect()
      const fr = f.getBoundingClientRect()
      const k = v.videoWidth / vr.width
      // 화면의 네모를 원본 좌표로 되돌린 값 — 화면 코드와 **같은 셈**이다
      return {
        w: Math.round(fr.width * k),
        h: Math.round(fr.height * k),
        src: v.videoWidth,
        frameOnScreen: Math.round(fr.width),
      }
    })
    // 네모가 화면에서 실제로 겨눌 만한 크기다 — 25px 짜리는 못 맞춘다 (사용자 지적)
    expect(geo.frameOnScreen).toBeGreaterThanOrEqual(40)
    // 원본 영역이 프레임 안에 든다
    expect(geo.w).toBeGreaterThan(0)
    expect(geo.w).toBeLessThanOrEqual(geo.src)
    console.log(`${zoom} 네모 화면 ${geo.frameOnScreen}px · 원본 ${geo.w}×${geo.h}`)
  }
})

test('권한을 막으면 무엇을 하면 되는지 말한다', async ({ page, context }) => {
  await context.clearPermissions()
  await context.grantPermissions([])
  await page.addInitScript(() => {
    // 가짜 기기가 붙어 있어도 거부 상황을 만든다
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.reject(Object.assign(new Error('denied'), { name: 'NotAllowedError' })),
    })
  })
  await openCamera(page)
  await expect(page.locator('.cam-trouble-head')).toHaveText('카메라를 쓸 수 없어요')
  await expect(page.locator('.cam-trouble-body')).toContainText('권한')
  // 막다른 곳에 두지 않는다
  await page.getByRole('button', { name: '읽기로 찾기로 돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()
})

/**
 * **끝까지 통하는가.** 가짜 카메라에 한자를 그려 넣어 인식 → 사전 → 찾기 입력란까지
 * 한 줄로 태운다. 인식 품질은 실측과 단위 검사가 맡고, 여기서 보는 것은 **배선**이다 —
 * 잘린 조각이 인식기로 가고, 사전이 읽기를 돌려주고, 그 읽기가 입력란에 꽂히는가.
 */
test('찍으면 사전 읽기가 찾기 입력란에 꽂힌다', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    // 가짜 카메라 — 캔버스에 한자를 그려 스트림으로 흘린다.
    //
    // **갈아 끼우기를 맨 먼저 한다.** document-start 에는 `document.documentElement` 가
    // 아직 없어서 거기 붙이려 들면 init 스크립트가 그 줄에서 통째로 죽는다 — 그러면
    // 갈아 끼우기가 실행조차 안 되고 가짜 기기(fake_device_0)가 그대로 온다 (실측으로
    // 한참 헤맨 자리다). 캔버스 붙이기는 문서가 선 뒤로 미룬다.
    const c = document.createElement('canvas')
    c.width = 720
    c.height = 1280
    const ctx = c.getContext('2d')!
    let n = 0
    const draw = () => {
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.fillStyle = '#111'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      // 네모는 원본의 216×216 이다. 글자가 그보다 크면 잘린다 (실측으로 한 번 잘렸다)
      ctx.font = '72px "Yu Gothic", Meiryo, "MS Gothic", sans-serif'
      // 세로쓰기 — 가운데에 두 글자를 쌓는다
      ctx.fillText('爆', c.width / 2, c.height / 2 - 42)
      ctx.fillText('弾', c.width / 2, c.height / 2 + 42)
      // 프레임이 바뀌었다는 표시. 같은 그림만 그리면 새 프레임이 안 나온다
      ctx.fillRect(0, 0, 2, (n++ % 3) + 1)
    }
    draw()
    // **대입은 안 먹는다** — 프로토타입의 접근자라 조용히 무시된다.
    // 그리고 **부를 때마다 새 스트림**을 준다. 하나를 돌려 쓰면 StrictMode 가 효과를 두 번
    // 태울 때 첫 정리에서 끈 트랙을 두 번째가 그대로 받아 readyState 가 ended 가 된다
    // (실측). 진짜 getUserMedia 도 부를 때마다 새로 준다
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: () => Promise.resolve(c.captureStream(12)),
    })
    // 캔버스가 문서에 붙어 있어야 프레임이 꾸준히 나온다
    const attach = () => {
      document.documentElement.append(c)
      c.style.cssText = 'position:fixed;left:-9999px;top:0'
      setInterval(draw, 80)
    }
    if (document.documentElement) attach()
    else document.addEventListener('DOMContentLoaded', attach, { once: true })
  })
  await openCamera(page)
  await page.waitForFunction(
    () => ((document.querySelector('.cam-stage video') as HTMLVideoElement | null)?.videoWidth ?? 0) > 100,
    null,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(600)
  await page.locator('.cam-stage').click()
  // 인식이 끝나면 찾기로 돌아가고 입력란이 채워져 있다
  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible({ timeout: 150_000 })
  await expect(page.locator('.search-input')).toHaveValue('ばくだん', { timeout: 20_000 })
  // 그 읽기로 기존 검색이 그대로 돌아 결과가 뜬다 — 카메라는 키보드를 대신할 뿐이다
  await expect(page.locator('.hit-group .r-main').first()).toHaveText('爆弾')
})
