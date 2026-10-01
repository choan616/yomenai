// 키 작은 폰에서 홈 맨 아래(단어장 진입로)가 탭바에 가려지지 않는지 (2026-10-01 사용자 실기기 캡처).
//
// 홈은 가운데 정렬 칼럼이고 모바일에서는 문서가 스크롤하지 않는다(`index.css`). 진입로를 맨 아래 한 줄로
// 더하면서 iPhone 크기(375×667)에서 탭바 밑에 반쯤 묻혔다. **클릭이 되는지만 보면 못 잡는다** —
// 누르는 점은 보이는 쪽에 걸리면 통과한다. 그래서 버튼 전체가 탭바 위에 있는지를 잰다.
import { expect, test } from '@playwright/test'

for (const [w, h] of [[360, 640], [375, 667]] as const) {
test(`${w}×${h} 에서 홈의 단어장 진입로가 탭바에 안 가린다`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: h })
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    localStorage.setItem('yomenai:diagnosticDone', '1')
    localStorage.setItem('yomenai:welcomeSeen', '1')
    localStorage.setItem('yomenai:wordlistHint', '1')
  })
  await page.goto('/')
  // 실사용처럼 「틀렸던 것」 줄까지 나오는 상태 — 가장 길 때를 잰다
  await page.evaluate(async () => {
    const res = await fetch('/dict/base.json')
    const dict = (await res.json()) as { idioms: { id: string }[] }
    const ids = dict.idioms.slice(0, 20).map((i) => i.id)
    await new Promise<void>((done) => {
      const req = indexedDB.open('yomenai')
      req.onsuccess = () => {
        const st = req.result.transaction('events', 'readwrite').objectStore('events')
        ids.forEach((idiomId, i) => {
          st.put({
            id: `0000${i}-seed`, userId: 'local', deviceId: 'e2e', at: Date.now() - 86_400_000 - i,
            idiomId, cardType: 'reading', mistakeType: 'RENDAKU', deletedAt: null,
            type: 'review', grade: 1, answer: 'あ', expected: 'い', correct: false, elapsedMs: 1000,
          })
        })
        st.put({
          id: '00999-star', userId: 'local', deviceId: 'e2e', at: Date.now(),
          idiomId: ids[0], cardType: 'reading', mistakeType: null, deletedAt: null,
          type: 'star', on: true,
        })
        st.transaction.oncomplete = () => done()
      }
    })
  })
  await page.reload()
  const open = page.getByRole('button', { name: /^단어장/ })
  await expect(open).toBeVisible({ timeout: 60_000 })

  const box = await open.boundingBox()
  const tab = await page.locator('.tabbar').boundingBox()
  expect(box && tab).toBeTruthy()
  expect(box!.y + box!.height, `단어장 버튼 아래 ${Math.round(box!.y + box!.height)} · 탭바 위 ${Math.round(tab!.y)}`).toBeLessThanOrEqual(tab!.y)

  await open.click({ timeout: 5_000 })
  await expect(page.getByRole('heading', { name: '단어장' })).toBeVisible()
})
}
