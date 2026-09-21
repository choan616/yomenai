// 리포트 처방 → 음독 대조 세션 (2026-09-21). 한 한자가 음독 둘을 쓸 때 그것들이 섞여 나오는지.
//
// `focus-session.spec.ts` 와 달리 **기록을 심는다.** 무작위로 틀려서 취약 음독을 만들면
// 그 한자에 형제 음독이 있는지가 운에 달리고, 그러면 이 검사가 헛돌 수 있다.
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(120_000)

/** 취약 음독이 잡히고(3회 이상) 처방이 나오는(읽기 30회 이상) 최소선을 넉넉히 넘긴다 */
const SEED_COUNT = 36

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

test('처방에서 대조 세션으로 들어가면 한 한자의 음독 둘이 섞여 나온다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeEnabled({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })

  // 人 じん 을 쓰는 숙어만 골라 전부 틀린 것으로 심는다. 짝꿍 한자는 숙어마다 달라
  // 노출 3회를 못 채우므로 취약 음독으로 올라오는 것은 人 じん 하나다
  const seeded = await page.evaluate(async (count: number) => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string; pairIds: string[] }[] }
    const ids = dict.idioms
      .filter((i) => i.pairIds.includes('人:on:じん'))
      .slice(0, count)
      .map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const tx = req.result.transaction('events', 'readwrite')
        const store = tx.objectStore('events')
        ids.forEach((idiomId, i) => {
          store.put({
            id: `00000${String(i).padStart(3, '0')}-seed`,
            userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'ONYOMI_CHOICE', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        tx.oncomplete = () => done()
      }
    })
    return ids.length
  }, SEED_COUNT)
  expect(seeded).toBe(SEED_COUNT)

  await page.reload()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.report .rx-list')).toBeVisible({ timeout: 20_000 })

  const rx = page.locator('.rx-list > li').filter({
    has: page.getByRole('button', { name: '두 음독을 갈라 풀기' }),
  })
  await expect(rx).toHaveCount(1)
  const kanji = (await rx.locator('.rx-title').innerText()).trim().charAt(0)

  await rx.getByRole('button', { name: '두 음독을 갈라 풀기' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 15_000 })

  // 앞에서부터 몇 장의 표기를 걷는다. 소개로 나오는 장도 표기는 보여준다
  const heads: string[] = []
  for (let i = 0; i < 8; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    // 요미가나가 붙은 장은 innerText 에 rt 가 섞인다 — 표기만 남긴다
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

  // 그 표기들이 그 한자의 **몇 가지 음독**을 쓰고 있나. 둘 이상이어야 대조다
  const bases = await page.evaluate(
    async ([target, words]: [string, string[]]) => {
      const res = await fetch('/dict/base.json')
      const dict = (await res.json()) as {
        idioms: { headword: string; pairIds: string[] }[]
      }
      const out = new Set<string>()
      for (const w of words) {
        const it = dict.idioms.find((i) => i.headword === w)
        const pid = it?.pairIds.find((p) => p.startsWith(`${target}:on:`))
        if (pid) out.add(pid)
      }
      return [...out]
    },
    [kanji, heads] as [string, string[]],
  )
  expect(bases.length, `${heads.join(' ')} 가 ${kanji} 의 음독 하나만 쓴다`).toBeGreaterThan(1)
})
