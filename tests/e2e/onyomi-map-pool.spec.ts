// 음독 맵의 분모가 **앞으로 출제될 범위와 같은가** (2026-09-23 사용자 보고
// 「음독맵의 숙지한 숫자와 밴드의 숙지 숫자가 다르다」).
//
// 진단·홈·리포트·세션은 모두 `studyPool` 로 훈독을 거르는데 음독 맵만 안 걸렀다.
// 기본값이 `kunPercent: 0`(훈독 끔)이라, 훈독 숙어에서만 오는 쌍이 영영 「미학습」으로
// 분모에 앉아 숙달 비율을 낮추고 있었다.
import { expect, test, type Page } from '@playwright/test'

/** 배포된 사전에서 쌍 수를 센다 — 화면이 읽는 것과 같은 파일이라야 검사가 뜻이 있다 */
async function pairCounts(page: Page): Promise<{ all: number; onOnly: number }> {
  return page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const { idioms } = (await res.json()) as {
      idioms: { readingKind: string; pairIds: string[] }[]
    }
    const all = new Set<string>()
    const onOnly = new Set<string>()
    for (const i of idioms) {
      for (const p of i.pairIds) {
        all.add(p)
        if (i.readingKind !== 'kun') onOnly.add(p)
      }
    }
    return { all: all.size, onOnly: onOnly.size }
  })
}

async function openMap(page: Page, kunPercent: number): Promise<number> {
  await page.evaluate((kun) => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
    localStorage.setItem('yomenai:settings', JSON.stringify({ kunPercent: kun }))
  }, kunPercent)
  await page.reload()
  await page.getByRole('button', { name: '리포트' }).click()
  await page.getByRole('button', { name: /음독 맵/ }).click()
  const head = page.locator('.stat-big')
  await expect(head).toContainText('숙달')
  const text = await head.innerText()
  const m = /한자 읽기\s+(\d+)쌍 중/.exec(text)
  if (!m) throw new Error('총계를 못 읽었다: ' + text)
  return Number(m[1]!.replace(/,/g, ''))
}

test('음독 맵의 분모가 훈독 설정을 따른다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  const { all, onOnly } = await pairCounts(page)
  // 사전에 훈독 전용 쌍이 실제로 있어야 이 검사가 뜻이 있다
  expect(all).toBeGreaterThan(onOnly)

  // 훈독 끔(기본값) — 훈독에서만 오는 쌍은 분모에서 빠진다
  expect(await openMap(page, 0)).toBe(onOnly)
  // 훈독 켬 — 전부 든다
  expect(await openMap(page, 100)).toBe(all)
})

/**
 * 두 화면이 **서로의 수치를 인용한다** (2026-09-23 사용자 선택 「둘 다 두되 서로를 밝힌다」).
 *
 * 단위가 다른 건 정상이다 — 표현 하나(明白)가 쌍 둘(明:めい·白:はく)로 쪼개지고 쌍 하나는
 * 여러 표현에 걸친다. 문제는 화면이 그걸 안 밝혀 어긋난 것으로 보인 것이었다. 그래서
 * **같은 이름으로 부른 수는 두 화면에서 같아야 한다** — 갈라지면 고친 의미가 없다.
 */
test('리포트와 음독 맵이 서로의 수치를 같은 값으로 인용한다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await page.evaluate(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
  })
  await seedStable(page)
  await page.reload()

  // ── 리포트 — 표현 총계와, 도구 행이 든 쌍 수치
  await page.getByRole('button', { name: '리포트' }).click()
  await expect(page.locator('.ladder')).toBeVisible()
  const idioms = num(await page.locator('.ladder-total').innerText(), /^(\d+)개$/)
  const note = await page.locator('.tools .tool-row').nth(1).innerText()
  const m = /한자 읽기 (\d+)\/(\d+)쌍 숙달/.exec(note)
  expect(m, '도구 행이 쌍 수치를 든다: ' + note).not.toBeNull()
  const [mastered, total] = [Number(m![1]), Number(m![2])]

  // ── 음독 맵 — 같은 쌍 수치와, 표현 쪽을 병기한 줄
  await page.getByRole('button', { name: /음독 맵/ }).click()
  await expect(page.locator('.stat-big')).toBeVisible()
  const head = await page.locator('.stat-big').innerText()
  expect(head).toContain(`한자 읽기 ${total}쌍 중 ${mastered}쌍 숙달`)
  // 표현 수치가 리포트와 **같은 값**이다. 갈라지면 두 화면이 또 다른 말을 한다
  await expect(page.locator('.unit-note').first()).toContainText(`표현으로는 ${idioms}개 숙지`)
  // 잣대가 다르다는 것도 화면이 말한다 — 쌍은 정확도, 표현은 시간을 본다
  await expect(page.locator('.unit-note').nth(1)).toContainText('오답률')
  await expect(page.locator('.unit-note').nth(1)).toContainText('안 잊으면')
})

function num(text: string, re: RegExp): number {
  const m = re.exec(text.trim())
  if (!m) throw new Error('못 읽었다: ' + text)
  return Number(m[1])
}

/** 다섯 표현을 숙지 상태로 만든다 — 간격을 벌려 다섯 번 맞히면 FSRS 안정 간격이 문턱을 넘는다 */
async function seedStable(page: Page): Promise<void> {
  await page.evaluate(
    (ids) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          ids.forEach((idiomId, ri) =>
            [60, 45, 30, 15, 2].forEach((d, i) =>
              store.put({
                id: `cite-${ri}-${i}`,
                userId: 'local',
                deviceId: 'e2e',
                at: Date.now() - d * 86_400_000,
                idiomId,
                cardType: 'reading',
                mistakeType: null,
                deletedAt: null,
                type: 'review',
                grade: 3,
                answer: 'x',
                expected: 'x',
                correct: true,
                elapsedMs: 1000,
              }),
            ),
          )
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
        req.onerror = () => rej(new Error('DB 열기 실패'))
      }),
    ['1000220', '1150680', '1150710', '1150840', '1012210'],
  )
}
