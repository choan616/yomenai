// 화면에 뜬 일본어에 `lang="ja"` 가 빠진 자리를 훑는다 (문법 노출 점검 축 D, 2026-09-17).
//
// 한중일 한자는 코드포인트가 통합돼 있어 `lang` 이 없으면 **한국 자형으로 그려지고,
// 사용자가 틀린 글자 모양을 학습한다** (CLAUDE.md 「일본어 렌더링」). 소스를 grep 하는 대신
// 실제로 그려진 것을 훑는다 — 오늘 난 두 건이 다 「데이터가 어디로 흘러가는지」 문제였다.
//
// 판정 범위는 앱 자신의 `JA_RUN`(src/app/ja.ts)과 같다. 한글 호환 자모(ㄱ·ㄹ)는 범위 밖이다.
import { expect, test, type Page } from '@playwright/test'

interface Scan {
  /** `lang="ja"` 밖에 있는 자리들 + 화면에 글자 그대로 찍힌 마크다운 */
  stray: string[]
  /** 그 화면에서 본 일본어 텍스트 노드 수 — 0 이면 검사가 헛돈 것이다 */
  seen: number
}

/**
 * 보이는 텍스트 중 일본어가 든 것인데 `lang="ja"` 밖에 있는 자리.
 *
 * `seen` 을 같이 돌려준다. 이동이 실패해 빈 화면을 훑어도 `stray` 는 비어서 통과하기
 * 때문이다 — **검증 장치가 헛돌면 통과가 아무 뜻이 없다** (2026-09-17 축 B 에서 배운 것).
 */
async function strayJa(page: Page, where: string): Promise<Scan> {
  return page.evaluate((label) => {
    const JA = /[々〆ー぀-ヿ㐀-䶿一-鿿]/
    // 규칙 본문은 마크다운 관례로 쓰여 있다. 별표가 화면에 그대로 찍히면 33b0eb9 의 재발이다
    const MD = /\*\*/
    const out: string[] = []
    let seen = 0
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n !== null; n = walk.nextNode()) {
      const text = (n.textContent ?? '').trim()
      if (text === '') continue
      if (MD.test(text)) {
        out.push(`${label} · 마크다운 잔여 — ${text.slice(0, 60)}`)
      }
      if (!JA.test(text)) continue
      const el = n.parentElement
      if (el === null) continue
      // 안 보이는 것은 건너뛴다 — 뜨는 순간 같이 걸린다
      if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue
      seen++
      if (el.closest('[lang="ja"]') !== null) continue
      const ja = text.match(/[々〆ー぀-ヿ㐀-䶿一-鿿]+/g)?.join(' ') ?? ''
      out.push(`${label} · lang 누락 <${el.tagName.toLowerCase()}.${el.className}> ${ja}  —  ${text.slice(0, 60)}`)
    }
    return { stray: out, seen }
  }, where)
}

/** 일본어가 떠 있어야 하는 화면 — 하나도 못 봤으면 이동이 안 된 것이다 */
async function scan(page: Page, where: string, found: string[], expectJa = true) {
  const { stray, seen } = await strayJa(page, where)
  found.push(...stray)
  if (expectJa) expect(seen, `${where} 에서 일본어를 하나도 못 봤다 — 검사가 헛돌았다`).toBeGreaterThan(0)
}

async function seed(page: Page) {
  await page.goto('/')
  // **버튼이 눌리게 될 때까지** 기다린다 — 보이기만 할 때는 앱이 아직 DB 를 안 만들었다.
  // 그 사이에 테스트가 열면 **스토어 없는 빈 DB 가 만들어지고**, 그다음 transaction 이
  // 던지면서 콜백 안이라 아무도 못 받는다 (WebKit 에서 2분 멈춤으로 드러났다, 2026-09-21)
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await page.evaluate(
    () =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          if (!req.result.objectStoreNames.contains('events')) {
            rej(new Error('events 스토어가 없다 — 앱이 DB 를 만들기 전에 열었다'))
            return
          }
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          const rows: [string, string, string, string][] = [
            ['1360930', 'しんぱい', 'しんはい', 'RENDAKU'],
            ['1360930', 'しんぱい', 'しんはい', 'RENDAKU'],
            ['1579550', 'みかづき', 'みかつき', 'RENDAKU'],
            ['1467640', 'はったつ', 'はつたつ', 'SOKUON'],
          ]
          rows.forEach(([idiomId, expected, answer, mistakeType], i) => {
            store.put({
              id: `0000003${i}-ja`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() - 86_400_000 - i,
              idiomId,
              cardType: 'reading',
              mistakeType,
              deletedAt: null,
              type: 'review',
              grade: 1,
              answer,
              expected,
              correct: false,
              elapsedMs: 1000,
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
  )
  await page.reload()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
}

test('화면에 뜬 일본어가 모두 lang="ja" 안에 있다', async ({ page }) => {
  await seed(page)
  const found: string[] = []

  await scan(page, '홈', found, false)

  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.bars')).toBeVisible({ timeout: 20_000 })
  // 분포는 유형 이름(한국어), 처방은 30회 미만이라 일본어가 안 뜬다. 이동은 .bars 가 지킨다
  await scan(page, '리포트', found, false)

  await page.getByRole('button', { name: /읽기 규칙/ }).click()
  const blocks = page.locator('.rule-block')
  await expect(blocks.first()).toBeVisible({ timeout: 20_000 })
  const n = await blocks.count()
  for (let i = 0; i < n; i++) await blocks.nth(i).locator('.rule-head').click()
  await scan(page, '읽기 규칙(전 절 펼침)', found)

  await page.getByRole('button', { name: /돌아가기/ }).first().click()
  await expect(page.locator('.bars')).toBeVisible({ timeout: 20_000 })

  await page.getByRole('button', { name: /다시보기 \d+장/ }).click()
  await expect(page.locator('.browse-slide').first()).toBeVisible({ timeout: 20_000 })
  const tag = page.locator('.browse-slide').first().locator('.rule-tag')
  if ((await tag.count()) > 0) await tag.first().click()
  await scan(page, '다시보기(규칙 펼침)', found)

  await page.getByRole('button', { name: /돌아가기/ }).first().click()
  await expect(page.locator('.bars')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: /음독 맵/ }).click()
  // 리포트에도 .section-title 이 있어 그걸로 보면 이동을 안 해도 통과한다 — 이 화면만의 것으로 본다
  await expect(page.locator('.stat-big')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.rows li').first()).toBeVisible({ timeout: 20_000 })
  await scan(page, '음독 맵', found)

  expect(found.join('\n')).toBe('')
})

test('세션 카드와 오답 상세의 일본어도 lang="ja" 안에 있다', async ({ page }) => {
  await seed(page)
  const found: string[] = []

  await page.getByRole('button', { name: '세션 시작', exact: true }).click()

  // 읽기 카드가 나올 때까지 (뜻 카드·소개는 넘긴다) — detail-preserves-input.spec.ts 와 같은 길
  const input = page.locator('.kana-input')
  for (let i = 0; i < 200; i++) {
    if (await input.isVisible().catch(() => false)) break
    for (const name of ['봤어요', '알고 있었다']) {
      const b = page.getByRole('button', { name, exact: true })
      if (await b.isVisible().catch(() => false)) await b.click()
    }
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) {
      const home = page.getByRole('button', { name: '홈으로', exact: true })
      if (await home.isVisible().catch(() => false)) await home.click()
      const again = page.getByRole('button', { name: '세션 시작', exact: true })
      if (!(await again.isVisible().catch(() => false))) break
      await again.click()
      await page.waitForTimeout(200)
      continue
    }
    await page.waitForTimeout(50)
  }
  await expect(input).toBeVisible({ timeout: 20_000 })
  await scan(page, '세션 — 읽기 카드', found)

  await input.fill('xxxxx')
  await input.press('Enter')
  await expect(page.locator('.card.feedback.is-ng')).toBeVisible({ timeout: 20_000 })
  await scan(page, '세션 — 오답 피드백', found)

  // 오답 상세 — 규칙 절을 카드 안에서 펼치는 자리
  await page.getByRole('button', { name: '자세히', exact: true }).click()
  await expect(page.locator('.mistake-detail')).toBeVisible({ timeout: 20_000 })
  await scan(page, '오답 상세', found)

  expect(found.join('\n')).toBe('')
})

test('사용 안내서의 일본어도 lang="ja" 안에 있다', async ({ page }) => {
  // 별도 정적 페이지라 앱의 Mixed 를 안 지난다. 표의 일본어가 직접 표시돼 있어야 한다
  await page.goto('/guide.html')
  await expect(page.locator('body')).toBeVisible({ timeout: 20_000 })
  const found: string[] = []
  await scan(page, '사용 안내서', found)
  expect(found.join('\n')).toBe('')
})
