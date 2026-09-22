// 전체 흐름 완주 검증 — 진입 진단 → 세션 → 리포트. IndexedDB 를 비워 결정론 확보 (PLAN §9)
import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

async function clickIfVisible(page: Page, name: string): Promise<boolean> {
  const btn = page.getByRole('button', { name, exact: true })
  if (await btn.isVisible().catch(() => false)) {
    await btn.click().catch(() => {})
    return true
  }
  return false
}

async function resetState(page: Page): Promise<void> {
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
}

test('진입 진단 → 세션 → 리포트 전체 흐름을 완주한다', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible({ timeout: 20_000 })
  await resetState(page)

  // ── 진입 진단 ──
  await page.getByRole('button', { name: /진입 진단 시작/ }).click()
  await expect(page.locator('.diag .headword').first()).toBeVisible({ timeout: 15_000 })

  // 항상 오답 → 밴드 1 에서 오답 3개에 닿아 적응형 진단이 조기 종료한다 (Phase 9-B)
  for (let i = 0; i < 500; i++) {
    if (await page.getByText('진단 완료').isVisible().catch(() => false)) break
    const input = page.locator('.kana-input')
    if (await input.isVisible().catch(() => false)) {
      await input.fill('zzz')
      await input.press('Enter')
      await page.waitForTimeout(20)
      continue
    }
    await page.waitForTimeout(30)
  }

  await expect(page.getByText('진단 완료')).toBeVisible({ timeout: 15_000 })
  // 조기 종료라 결과엔 실제로 푼 밴드만 뜬다. 최소 1개는 있어야 한다
  expect(await page.locator('.bars .bar-row').count()).toBeGreaterThanOrEqual(1)

  // ── 리포트 (진단 결과가 실려 있어야 한다) ──
  await page.getByRole('button', { name: '진단 리포트 보기' }).click()
  await expect(page.locator('.report')).toBeVisible()
  // 수준 — 밴드 사다리와 한 줄 판정 (Phase 10)
  await expect(page.getByText('지금 수준')).toBeVisible()
  // 진단 결과에 따라 "밴드 N까지 안정" 또는 "아직 말할 만큼 안 풀었어요" 중 하나가 온다
  await expect(page.locator('.level .report-lead')).not.toBeEmpty()
  await expect(page.locator('.level .stat-line')).toContainText('읽기')
  await expect(page.locator('.level .stat-line')).toContainText('정답률')
  expect(await page.locator('.ladder .bar-row').count()).toBeGreaterThanOrEqual(3)
  // 사다리 숫자는 정답률이 아니라 붙은 숙어 개수다 (2026-09-19). 흔들림은 상태 줄로 내려갔다
  await expect(page.locator('.ladder-title')).toHaveText('밴드별 숙지한 표현')
  await expect(page.locator('.ladder-caption')).toContainText('숙지')
  // 이름이 포함 범위를 말해야 한다 — 틀린 것·넘긴 것이 들어가고 소개만 본 건 빠진다 (2026-09-20)
  await expect(page.locator('.ladder-caption')).toContainText('틀린 것·넘긴 것도')
  // 막대 오른쪽에는 텍스트가 없다. 판정은 알약 배지, 수치는 아래 한 줄이다 (2026-09-22)
  await expect(page.locator('.ladder .bar-num')).toHaveCount(0)
  // 밴드 행에는 막대가 없다 (2026-09-22) — `stable/met` 은 새 표현을 만날수록 분모만 늘어
  // 막대가 내려간다. 비율은 위 요약 막대가 한 번만 그린다
  await expect(page.locator('.ladder .bar-track')).toHaveCount(0)
  // 요약 막대 — 분모가 「숙지한 전체 개수」라 세그먼트 합이 늘 100% 다
  const mix = page.locator('.mix-bar')
  if ((await mix.count()) > 0) {
    const sum = await mix.evaluate((el) => {
      const bar = el.getBoundingClientRect().width
      const segs = [...el.children].map((c) => c.getBoundingClientRect().width)
      // 세그먼트 사이 2px 간격만큼 줄어든다 — 그 몫을 되돌려 합을 본다
      return (segs.reduce((a, b) => a + b, 0) + Math.max(0, segs.length - 1) * 2) / bar
    })
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(0.02)
    // 범례가 막대의 값을 글자로 준다 — 막대는 aria-hidden 이라 읽히는 건 이 줄이다
    await expect(page.locator('.mix-legend')).toHaveText(/밴드 d+ d+%/)
    // 총계가 요약 막대의 분모다
    await expect(page.locator('.ladder-total')).toHaveText(/^d+개$/)
  }
  const badge = page.locator('.ladder .band-badge').first()
  await expect(badge).toHaveText(/^(안정|흔들림|표본 부족|미학습)$/)
  expect(await badge.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('999px')
  const nums = page.locator('.ladder .band-note .dim').first()
  if ((await nums.count()) > 0) {
    await expect(nums).toHaveText(/출제 \d+개 \/ 숙지 \d+개/)
    // 기본 글자에서는 한 줄이다 — 줄이 접히면 이 칸이 다시 복잡해진다 (2026-09-22)
    expect(await nums.evaluate((el) => el.getClientRects().length)).toBe(1)
    // 배지와 수치가 **같은 오른쪽 선**에 선다 (2026-09-22 사용자 요청). 배지를 밴드 이름
    // 옆에 두면 그 선이 안 생긴다 — 그게 막대 오른쪽 끝을 고른 이유다
    const item = page
      .locator('.ladder .ladder-item')
      .filter({ has: page.locator('.band-note .dim') })
      .first()
    const gap = await item.evaluate((el) => {
      const badge = el.querySelector('.band-badge')!.getBoundingClientRect()
      const note = el.querySelector('.band-note .dim')!.getBoundingClientRect()
      return Math.round(badge.right - note.right)
    })
    expect(Math.abs(gap)).toBeLessThanOrEqual(1)
  }
  // 처방 — 진단 직후는 표본이 적어 "더 봐야 한다"가 뜬다
  await expect(page.getByText('다음에 볼 것')).toBeVisible()
  await expect(page.locator('.rx-list > li').first()).toBeVisible()
  await expect(page.getByText('오답 유형 분포')).toBeVisible()
  // 다시보기 진입 둘은 분포 아래 한 줄에 있다 (2026-09-18)
  await expect(page.locator('.browse-pair')).toBeVisible()
  await expect(page.getByRole('button', { name: /무작위 다시보기/ })).toBeVisible()
  await expect(page.getByText('취약 음독')).toBeVisible()

  // ── 홈 탭: 진단을 마쳤으니 진입점이 사라진다 (리포트는 탭 루트라 「‹」 가 없다) ──
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible()

  // ── "3장만" — 설정을 안 건드리고 이번만 짧게 (Phase 11) ──
  await page.getByRole('button', { name: /3장만/ }).click()
  await expect(page.locator('.study-bar .count')).toContainText('/ 3')
  for (let i = 0; i < 40; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    // 처음 만나는 숙어는 소개로 나온다 (2026-09-13) — 보고 넘긴다
    if (await clickIfVisible(page, '봤어요')) continue
    if (await clickIfVisible(page, '알고 있었다')) continue
    const qi = page.locator('.kana-input')
    if (await qi.isVisible().catch(() => false)) {
      await qi.fill('tadashii')
      await qi.press('Enter')
      await page.waitForTimeout(20)
      continue
    }
    if (await clickIfVisible(page, '뜻 보기')) continue
    if (await clickIfVisible(page, '알았어요')) continue
    await page.waitForTimeout(30)
  }
  await expect(page.getByText('세션 완료')).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: '홈으로' }).click()
  // 다음 세션은 다시 원래 길이로 돌아온다
  await expect(page.getByRole('button', { name: '세션 시작' })).toBeVisible()
  await expect(page.getByRole('button', { name: /진입 진단 시작/ })).toHaveCount(0)

  // ── 세션 완주 ──
  await page.getByRole('button', { name: '세션 시작' }).click()
  await expect(page.locator('.headword').first()).toBeVisible({ timeout: 10_000 })

  for (let i = 0; i < 120; i++) {
    if (await page.getByText('세션 완료').isVisible().catch(() => false)) break
    // 피드백 중이면 다음으로. 입력창이 계속 보이므로(locked) 이 검사가 먼저다
    if (await page.locator('.card.feedback').isVisible().catch(() => false)) {
      await clickIfVisible(page, '다음')
      await page.waitForTimeout(20)
      continue
    }
    // 처음 만나는 숙어는 소개로 나온다 (2026-09-13) — 보고 넘긴다
    if (await clickIfVisible(page, '봤어요')) continue
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
  await expect(page.getByText('세션 완료')).toBeVisible({ timeout: 15_000 })

  // ── 리포트 재진입 ──
  await page.getByRole('button', { name: '홈으로' }).click()
  await page.getByRole('button', { name: '리포트', exact: true }).click()
  await expect(page.locator('.report')).toBeVisible()
  await expect(page.getByText('오답 유형 분포')).toBeVisible()
  // 세션까지 마쳐 표본이 30회를 넘었으니 처방이 "더 봐야 한다"가 아닌 실제 항목으로 바뀐다
  expect(await page.locator('.rx-list > li').count()).toBeGreaterThanOrEqual(1)
})
