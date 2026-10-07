// 읽기 규칙 화면 검증 — 절이 접혀 있다가 펼쳐지고, 예시·대조가 뜨고, 기록이 없으면 그렇게 말한다 (2026-09-17).
// 읽을거리가 아니라 색인이라는 게 이 화면의 정체라, 기록 자리가 있는지까지 본다.
import { expect, test, type Page } from '@playwright/test'

/** 규칙 화면은 리포트 탭 아래에 있다 (2026-09-17 하단 탭 전환). 기록이 없어도 도구 절에 뜬다 */
async function openRules(page: Page): Promise<void> {
  const tab = page.getByRole('button', { name: '리포트', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()
  await page.getByRole('button', { name: /읽기 규칙/ }).click()
}

test('리포트 탭에서 읽기 규칙을 열고 절을 펼친다', async ({ page }) => {
  await page.goto('/')
  await openRules(page)

  await expect(page.getByRole('heading', { name: '읽기 규칙' })).toBeVisible()

  // 아홉 절이 접힌 채로 — 다 펼쳐져 있으면 지도가 아니라 벽이다 (2026-09-18 청탁 절 추가)
  const blocks = page.locator('.rule-block')
  await expect(blocks).toHaveCount(9)
  await expect(page.locator('.rule-open')).toHaveCount(0)

  // 맨 앞은 한국 한자음 대응. 나머지 규칙이 여기서 갈린다
  const first = blocks.first()
  await expect(first).toContainText('한국 한자음이 음독의 꼬리를 정한다')
  await first.locator('.rule-head').click()

  const open = first.locator('.rule-open')
  await expect(open).toBeVisible()
  await expect(open).toContainText('ㄱ 받침은')
  // 예시는 표기와 읽기가 같이 — 일본어는 lang="ja" 로 (CLAUDE.md 자형 규칙)
  const example = open.locator('.rule-examples > li').first()
  await expect(example.locator('.rule-word')).toHaveAttribute('lang', 'ja')
  await expect(example).toContainText('特徴')

  // 대조 — 걸린 것과 안 걸린 것이 나란히
  await expect(open.locator('.rule-contrast').first()).toContainText('目的')

  // 한국어 문장에 섞인 일본어에도 lang="ja" 가 붙는다.
  // 안 붙으면 한중일 통합 코드포인트가 한국 자형으로 그려져 틀린 글자 모양을 학습한다
  const inline = open.locator('.rule-para [lang="ja"]').filter({ hasText: '学' }).first()
  await expect(inline).toBeVisible()
  const font = await inline.evaluate((el) => getComputedStyle(el).fontFamily)
  expect(font).toContain('Noto Sans JP')

  // 기록이 없는 새 기기라면 그렇게 말한다 (있으면 횟수가 뜬다)
  await expect(open.locator('.rule-record')).toBeVisible()

  // 한 번에 한 절만 열린다
  await blocks.nth(1).locator('.rule-head').click()
  await expect(page.locator('.rule-open')).toHaveCount(1)
  await expect(blocks.nth(1).locator('.rule-open')).toContainText('촉음')

  // 열린 촉음 절에서 — 강조는 굵게 그린다. 마크다운 별표가 글자로 찍히면 안 된다 (2026-09-17).
  // 절의 비대칭 설명이 그 자리였다
  const sokuon = blocks.nth(1).locator('.rule-open')
  await expect(sokuon).not.toContainText('**')
  const strong = sokuon.locator('.rule-para strong').first()
  await expect(strong).toBeVisible()
  expect(Number(await strong.evaluate((el) => getComputedStyle(el).fontWeight))).toBeGreaterThan(400)
  // 굵은 구간 안의 일본어에도 lang="ja" 가 살아 있다 (자형 규칙은 강조보다 우선한다)
  await expect(strong.locator('[lang="ja"]').first()).toBeVisible()

  // 연탁 절이 라이먼의 법칙과 대등 합성을 다 짚는다 — 사용자가 물은 자리다
  const rendaku = blocks.filter({ hasText: '연탁' }).first()
  await rendaku.locator('.rule-head').click()
  await expect(rendaku.locator('.rule-open')).toContainText('라이먼')
  await expect(rendaku.locator('.rule-contrast').first()).toContainText('春風')

  // 나가면 자기 탭 루트(리포트)로 — 탭이 자리를 기억하므로 복귀 상태가 필요 없다
  await page.getByRole('button', { name: '돌아가기' }).click()
  await expect(page.getByRole('heading', { name: '진단 리포트' })).toBeVisible()
})

test('반탁 오답은 연탁이 아니라 반탁으로 불린다', async ({ page }) => {
  // 분류기는 연탁·반탁·연성을 한 유형으로 묶는다. 이름과 규칙 절만 갈래를 따라간다 (2026-09-17)
  await page.goto('/')
  await openRules(page)

  const handaku = page.locator('.rule-block').filter({ hasText: 'ぱ행으로' }).first()
  await handaku.locator('.rule-head').click()
  const open = handaku.locator('.rule-open')
  // 기록이 0이어도 그 절이 무슨 이름으로 세는지는 보인다
  await expect(open.locator('.rule-record')).toContainText('반탁')
  await expect(open.locator('.rule-record')).not.toContainText('연탁')

  // 펼친 반탁 절 본문에도 「연성」 이라는 낱말이 있어 텍스트 필터는 그쪽을 먼저 잡는다 — 차례로 지목한다
  const renjo = page.locator('.rule-block').nth(3)
  await expect(renjo.locator('.rule-title')).toContainText('연성')
  await renjo.locator('.rule-head').click()
  await expect(renjo.locator('.rule-open .rule-record')).toContainText('연성')
})

// 전부 がく/発 가 촉음(sokuon)으로 분해되는 실재 표제어다 — 서로 다른 숙어라야 "첫 만남"이 늘어난다
const SOKUON_FIRST_TRY_IDIOMS: { id: string; headword: string; reading: string }[] = [
  { id: '1206730', headword: '学校', reading: 'がっこう' },
  { id: '1477180', headword: '発火', reading: 'はっか' },
  { id: '1477200', headword: '発覚', reading: 'はっかく' },
  { id: '1477310', headword: '発見', reading: 'はっけん' },
  { id: '1477620', headword: '発生', reading: 'はっせい' },
]

/** 촉음 숙어 n개(1~5)를 정답 읽기 1회씩 심는다. FIRST_TRY_MIN_SAMPLE(5) 문턱을 넘나드는 경계를 본다 */
async function seedSokuonFirstTry(page: Page, n: number): Promise<void> {
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
  const idioms = SOKUON_FIRST_TRY_IDIOMS.slice(0, n)
  await page.evaluate(
    (idioms) =>
      new Promise<void>((res, rej) => {
        const req = indexedDB.open('yomenai')
        req.onsuccess = () => {
          const tx = req.result.transaction('events', 'readwrite')
          const store = tx.objectStore('events')
          idioms.forEach((it, i) => {
            store.put({
              id: `rules-firsttry-${i}`,
              userId: 'local',
              deviceId: 'e2e',
              at: Date.now() + i,
              idiomId: it.id,
              cardType: 'reading',
              mistakeType: null,
              deletedAt: null,
              type: 'review',
              grade: 3,
              answer: it.reading,
              expected: it.reading,
              correct: true,
              elapsedMs: 1000,
            })
          })
          tx.oncomplete = () => res()
          tx.onerror = () => rej(new Error('심기 실패'))
        }
      }),
    idioms,
  )
  await page.reload()
}

test('규칙 절 — 첫 만남 정답률이 재는 절에만 뜬다', async ({ page }) => {
  await seedSokuonFirstTry(page, 5)
  await openRules(page)

  // 촉음은 재는 절이고 표본(5개)이 문턱을 채웠다 — 「처음 만난 N개 중 M개」가 뜬다
  const sokuon = page.locator('.rule-block').filter({ hasText: '촉음은 꼬리와' }).first()
  await sokuon.locator('.rule-head').click()
  await expect(sokuon.locator('.rule-open .first-try')).toHaveText('처음 만난 5개 중 5개를 읽었어요')

  // 연탁은 재는 절이지만 이 기록엔 표본이 없다 — 0개를 말로 한다
  const rendaku = page.locator('.rule-block').filter({ hasText: '연탁 — 두 낱말이' }).first()
  await rendaku.locator('.rule-head').click()
  await expect(rendaku.locator('.rule-open .first-try')).toHaveText('아직 처음 만난 말이 없어요')

  // 장음은 안 재는 절이다 — 줄 자체가 없다
  const choon = page.locator('.rule-block').filter({ hasText: '장음은 글자마다' }).first()
  await choon.locator('.rule-head').click()
  await expect(choon.locator('.rule-open .first-try')).toHaveCount(0)
})

test('규칙 절 — 표본이 FIRST_TRY_MIN_SAMPLE 미만이면 비율 대신 "N개뿐"을 말한다', async ({ page }) => {
  // 1개만 심는다 — 연성이 실로그에서 1개로 0% 를 낸 사례와 같은 자리다(decisions.md)
  await seedSokuonFirstTry(page, 1)
  await openRules(page)

  const sokuon = page.locator('.rule-block').filter({ hasText: '촉음은 꼬리와' }).first()
  await sokuon.locator('.rule-head').click()
  await expect(sokuon.locator('.rule-open .first-try')).toHaveText('처음 만난 말이 1개뿐이라 아직 비율을 안 내요')
})
