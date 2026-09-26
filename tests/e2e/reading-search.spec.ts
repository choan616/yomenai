// 읽기로 찾기 검증 — 로마자 입력이 가나로 바뀌고, 동음 묶음이 한국 한자음과 함께 뜬다 (2026-09-16).
// 보기만 하는 화면이라 채점 요소가 없어야 한다는 것도 같이 본다.
import { expect, test } from '@playwright/test'

test('히라가나로 한자 표기를 찾는다', async ({ page }) => {
  await page.goto('/')
  const tab = page.getByRole('button', { name: '찾기', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()

  await expect(page.getByRole('heading', { name: '읽기로 찾기' })).toBeVisible()

  // 찾기 전에는 범위를 먼저 알린다 — 검색창이 약속하는 것과 코퍼스가 다르다
  await expect(page.locator('.search-scope')).toContainText('한자 숙어')

  const input = page.getByLabel('읽기 또는 한자 검색')
  await input.fill('kouki')
  await expect(input).toHaveValue('こうき')

  // 묶음 머리 = 읽기 + 개수
  const group = page.locator('.hit-group').first()
  await expect(group.locator('.section-title')).toContainText('こうき')

  // 표기·한국 한자음·뜻이 한 줄에
  const kouki = group.locator('.rows > li').filter({ hasText: '光輝' })
  await expect(kouki).toContainText('광휘')
  await expect(kouki).toContainText('광채')

  // 한국 한자음까지 겹치는 줄(後期/후기 · 後記/후기)에 표식이 붙는다
  await expect(group.locator('.rows > li').filter({ hasText: '後期' }).locator('.kr-dup')).toBeVisible()
  await expect(kouki.locator('.kr-dup')).toHaveCount(0)

  // 앞부분 일치 — 다 치기 전에도 후보가 나온다
  await input.fill('こうしょう')
  await expect(page.locator('.hit-group .section-title').first()).toContainText('こうしょう')
  // **표기가 정확히 그것인 줄**을 집는다. 부분 일치로 잡으면 交渉人·団体交渉 까지
  // 걸린다 — 밴드 4 를 열면서 9줄이 됐다 (2026-09-23)
  await expect(
    page.locator('.rows > li').filter({ has: page.locator('.r-main', { hasText: /^交渉$/ }) }),
  ).toContainText('교섭')

  // 채점하는 화면이 아니다
  await expect(page.locator('.kana-input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '확인' })).toHaveCount(0)

  // 없는 읽기는 실패가 아니라 답이다
  await input.fill('arigatou')
  await expect(input).toHaveValue('ありがとう')
  await expect(page.locator('.empty')).toContainText('없어요')
  await expect(page.locator('.search-scope')).toBeVisible()

  // 찾기는 탭 루트라 「‹」 가 없다 — 홈 탭으로 돌아간다 (2026-09-17 하단 탭 전환)
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible()
})

// 한자를 그대로 넣어 찾는다 (2026-09-24 사용자 요청).
// 책에서 본 한자를 가져올 때 쓰는 길이다 — 읽는 법을 모르니까 찾는 것인데,
// 그전에는 읽기를 알아야만 찾을 수 있었다.
test('한자를 붙여넣으면 표기로 찾고 읽기를 알려 준다', async ({ page }) => {
  await page.goto('/')
  const tab = page.getByRole('button', { name: '찾기', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()

  const input = page.getByLabel('읽기 또는 한자 검색')
  // fill 은 붙여넣기와 같은 경로다 — 자판을 거치지 않고 값이 통째로 들어온다
  await input.fill('交渉')
  await expect(input).toHaveValue('交渉')

  // 묶음 제목이 읽기다 — 한자로 찾았어도 알고 싶은 것은 읽기다
  const group = page.locator('.hit-group').first()
  await expect(group.locator('.section-title')).toContainText('こうしょう')
  await expect(
    group.locator('.rows > li').filter({ has: page.locator('.r-main', { hasText: /^交渉$/ }) }),
  ).toContainText('교섭')

  // 사전에 없는 표기는 읽기 쪽과 다른 문구로 답한다
  await input.fill('爆轟')
  await expect(page.locator('.empty')).toContainText('표기가 학습 사전에 없어요')
})

// 학습 사전 밖 (2026-09-25). 상용한자 밖 글자가 섞여 임포트가 버린 표현들이다.
// 찾을 수 있는 범위의 잣대로 상용한자표를 쓸 근거가 없다 — 책에 나오는 글자와 다른 집합이다.
test('학습 사전에 없으면 밖에서 찾을지 묻고, 그러면 찾아 준다', async ({ page }) => {
  await page.goto('/')
  const tab = page.getByRole('button', { name: '찾기', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()

  const input = page.getByLabel('읽기 또는 한자 검색')
  await input.fill('爆轟')
  await expect(page.locator('.empty')).toContainText('학습 사전에 없어요')

  // 묻기 전에는 안 받는다 — 사전 2.2MB + 전용 글꼴이 딸려 온다
  const ask = page.getByRole('button', { name: '학습 사전 밖에서 찾기' })
  await expect(ask).toBeVisible()
  await ask.click()

  const group = page.locator('.hit-group.outside').first()
  await expect(group.locator('.section-title')).toContainText('ばくごう', { timeout: 30_000 })
  const row = group.locator('.rows > li').filter({ hasText: '爆轟' })
  await expect(row).toContainText('폭굉') // 한국 한자음 — 轟 은 넓힌 사전 쪽 자료에만 있다
  // 한국어 번역이 실린 뒤로는 한국어가 뜬다 (2026-09-26). 없으면 영어 gloss 가 그대로 온다
  await expect(row.locator('.r-meaning')).not.toBeEmpty()

  // **담기를 안 낸다** — 음독 분해가 없어 세션에 못 들어간다. 별을 두면 거짓말이다
  // 爆轟 은 음독으로 갈라지므로 담을 수 있다 — 갈라지는 것과 아닌 것은 아래 테스트가 본다
  await expect(row.getByRole('button', { name: /爆轟 담기/ })).toBeVisible()
  await expect(page.locator('.outside-note')).toContainText('담으면 세션에 들어와요')

  // 전용 @font-face 선언이 붙는다 — 없으면 轟 이 시스템 폰트로 떨어진다 (한중일 통합)
  await expect(page.locator('link[href$="fonts/wide.css"]')).toHaveCount(1)

  // 한 번 받았으면 다음부터는 안 묻는다
  await input.fill('躊躇')
  await expect(page.locator('.hit-group.outside .section-title').first()).toContainText('ちゅうちょ')
  await expect(page.getByRole('button', { name: '학습 사전 밖에서 찾기' })).toHaveCount(0)
})

// 들이기 (2026-09-25). 15,114개를 통째로 들이면 음독 쌍이 2,532 → 4,794 가 되고 그 절반이
// 상용 밖 글자라 「숙지한 음독」이 재는 것이 달라진다. 담은 것만 올리면 분모가 내가 넓힌
// 만큼만 늘어서 지표의 성격이 안 바뀐다.
test('넓힌 사전에서 담을 수 있는 것과 없는 것을 갈라 낸다', async ({ page }) => {
  await page.goto('/')
  const tab = page.getByRole('button', { name: '찾기', exact: true })
  await expect(tab).toBeVisible({ timeout: 20_000 })
  await tab.click()

  const input = page.getByLabel('읽기 또는 한자 검색')
  await input.fill('爆轟')
  await page.getByRole('button', { name: '학습 사전 밖에서 찾기' }).click()

  const row = page.locator('.hit-group.outside .rows > li').filter({ hasText: '爆轟' })
  await expect(row).toBeVisible({ timeout: 30_000 })
  // 음독으로 갈라지므로 담을 수 있다
  const add = row.getByRole('button', { name: /爆轟 담기/ })
  await expect(add).toBeVisible()
  await add.click()
  await expect(row.getByRole('button', { name: /爆轟 빼기/ })).toBeVisible()

  // 훈독뿐이라 못 담는 것은 이유를 적는다 — 누른 뒤에 안 된다고 하면 늦다
  await input.fill('逢引')
  const kun = page.locator('.hit-group.outside .rows > li').filter({ hasText: '逢引' })
  await expect(kun.locator('.star-slot')).toHaveText('읽기만')
  await expect(kun.getByRole('button')).toHaveCount(0)

  // 담은 것은 단어장에 뜬다 — 넓힌 사전에서 되짚어 오지 않으면 조용히 사라진다
  await input.fill('')
  await page.getByRole('button', { name: /^단어장/ }).click()
  const wl = page.locator('.review-row').filter({ hasText: '爆轟' })
  await expect(wl).toBeVisible({ timeout: 30_000 })
  await expect(wl.locator('.wl-state')).toHaveText('아직 안 나옴')
})
