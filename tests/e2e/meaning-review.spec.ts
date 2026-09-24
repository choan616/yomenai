// 뜻 검수 (2026-09-24 사용자 요청 「검수를 원격으로」).
//
// 못 박는 것 셋 — **켜기 전에는 흔적이 없다**, 켜면 내가 만난 것만 올라온다,
// 고친 뜻이 `flag` 이벤트에 `fix` 로 남는다.
import { expect, test, type Page } from '@playwright/test'

const DAY = 86_400_000

async function seed(page: Page): Promise<void> {
  await page.evaluate(
    (day) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const st = tx.objectStore('events')
          // 만난 것 하나(채점 기록) + 담은 것 하나
          st.put({
            id: 'rv-1', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1000220', cardType: 'reading', mistakeType: null, deletedAt: null,
            type: 'review', grade: 3, answer: 'x', expected: 'x', correct: true, elapsedMs: 900,
          })
          st.put({
            id: 'rv-2', userId: 'local', deviceId: 'e2e', at: Date.now() - day,
            idiomId: '1150680', on: true, deletedAt: null, type: 'star',
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    DAY,
  )
}

async function openSettings(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  })
  await page.goto('/')
  await seed(page)
  await page.reload()
  await page.getByRole('button', { name: '설정' }).click()
  await expect(page.getByRole('heading', { name: '설정' })).toBeVisible()
}

test('켜기 전에는 흔적이 없고, 길게 누르면 열린다', async ({ page }) => {
  test.setTimeout(120_000)
  await openSettings(page)
  // 보통 학습자에게는 그냥 묶음 제목이다
  await expect(page.getByRole('button', { name: /뜻 검수/ })).toHaveCount(0)

  // **진짜 포인터로 누른다.** dispatchEvent 로 만든 합성 이벤트는 React 의 onPointerDown
  // 에 안 닿는다 (실측)
  const title = page.locator('h3.setting-group').filter({ hasText: /^보기$/ }).first()
  // **먼저 스크롤해서 올린다.** 설정 맨 아래라 화면 밖이고, 거기로 마우스를 옮기면
  // 아무 일도 안 일어난다 (실측)
  await title.scrollIntoViewIfNeeded()
  const box = await title.boundingBox()
  if (box === null) throw new Error('「보기」 제목을 못 찾았다')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.waitForTimeout(1500)
  await page.mouse.up()
  await expect(page.getByRole('button', { name: /뜻 검수/ })).toBeVisible()

  // 기기에 남는다 — 다시 들어와도 켜져 있다
  await page.reload()
  await page.getByRole('button', { name: '설정' }).click()
  await expect(page.getByRole('button', { name: /뜻 검수/ })).toBeVisible()
})

test('내가 만난 것만 올라오고, 고친 뜻이 fix 로 남는다', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:reviewMode', '1')
    } catch {
      /* private mode */
    }
  })
  await openSettings(page)
  await page.getByRole('button', { name: /뜻 검수/ }).click()
  await expect(page.getByRole('heading', { name: '뜻 검수' })).toBeVisible()
  await expect(page.locator('.review-row').first()).toBeVisible({ timeout: 60_000 })

  const rows = page.locator('.review-row')
  const n = await rows.count()
  console.log('올라온 줄 ' + n)
  // 만난 것(明白) + 담은 것(愛好) 둘뿐이다 — 미검수 10만 개를 늘어놓지 않는다
  expect(n).toBe(2)
  await expect(page.locator('.review-head .r-main').first()).toHaveText(/明白|愛好/)

  // 고치기 → 입력 → 저장
  const row = rows.filter({ hasText: '明白' }).first()
  await row.getByRole('button', { name: '고치기' }).click()
  const input = row.locator('input')
  await input.fill('아주 분명함')
  await row.getByRole('button', { name: '고침 저장' }).click()
  await expect(row.locator('.review-fix')).toHaveText('고침: 아주 분명함')

  // 이벤트에 그대로 남았나
  const ev = await page.evaluate(
    () =>
      new Promise<unknown[]>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const out: unknown[] = []
          const cur = req.result.transaction('events').objectStore('events').openCursor()
          cur.onsuccess = () => {
            const c = cur.result
            if (!c) return res(out)
            const v = c.value as { type?: string }
            if (v.type === 'flag') out.push(v)
            c.continue()
          }
          cur.onerror = () => rej(new Error('읽기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
  )
  console.log('FLAG=' + JSON.stringify(ev))
  expect(ev).toHaveLength(1)
  const flag = ev[0] as { verdict: string; fix: string; definition: string; headword: string }
  expect(flag.verdict).toBe('bad')
  expect(flag.fix).toBe('아주 분명함')
  // 무엇을 보고 고쳤는지도 같이 남는다
  expect(flag.definition).toBeTruthy()
  expect(flag.headword).toBe('明白')
})
