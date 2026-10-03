// 소리 취향 — 설정에서 음성과 속도를 고르고 들어 보며, 고른 값이 실제 발화에 쓰인다 (2026-10-03)
//
// 사용자 지적 「tts가 너무 딱딱하다」. 소리는 코드가 못 들으므로 기기에 있는 음성을 직접 고르게 했다.
// 실제 오디오는 검증하지 않는다 — `speechSynthesis` 를 가짜로 바꿔 어떤 음성·속도로 발화했는지만 기록한다.
import { expect, test, type Page } from '@playwright/test'

interface Spoken {
  text: string
  lang: string
  rate: number
  voice: string | null
}

/** 가짜 음성 셋과 발화 기록 — 브라우저 전역을 통째로 바꾼다 */
async function installFakeSpeech(page: Page, voices: { name: string; local: boolean }[]): Promise<void> {
  await page.addInitScript((vs) => {
    const spoken: unknown[] = []
    const fake = {
      getVoices: () =>
        vs.map((v) => ({ name: v.name, lang: 'ja-JP', localService: v.local, default: false })),
      speak: (u: { text: string; lang: string; rate: number; voice: { name: string } | null }) => {
        spoken.push({ text: u.text, lang: u.lang, rate: u.rate, voice: u.voice?.name ?? null })
      },
      cancel: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
    }
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true })
    // 진짜 SpeechSynthesisUtterance 는 가짜 음성 객체를 `voice` 에 못 받는다(진짜 SpeechSynthesisVoice 만 받는다).
    // 앱 코드는 그대로 두고 발화 객체만 같은 모양의 평범한 객체로 바꾼다
    class FakeUtterance {
      text: string
      lang = ''
      rate = 1
      voice: { name: string } | null = null
      constructor(text: string) {
        this.text = text
      }
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: FakeUtterance, configurable: true })
    ;(window as unknown as { __spoken: unknown[] }).__spoken = spoken
    try {
      localStorage.setItem('yomenai:diagnosticDone', '1')
      localStorage.setItem('yomenai:welcomeSeen', '1')
    } catch {
      /* private mode */
    }
  }, voices)
}

const spokenOf = (page: Page): Promise<Spoken[]> =>
  page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken)

async function openSettings(page: Page): Promise<void> {
  await page.goto('/')
  await page.getByRole('button', { name: '설정', exact: true }).click()
}

const VOICES = [
  { name: 'Microsoft Ayumi - Japanese (Japan)', local: true },
  { name: 'Microsoft Haruka - Japanese (Japan)', local: true },
  { name: 'Microsoft Nanami Online (Natural) - Japanese (Japan)', local: false },
]

test('자동이면 신경망 음성을 고르고, 목록에는 온라인 표시가 붙는다', async ({ page }) => {
  await installFakeSpeech(page, VOICES)
  await openSettings(page)

  const select = page.getByLabel('음성')
  await expect(select).toBeVisible()
  // 화면용 이름 — 접두사와 언어 꼬리를 뗀다. 온라인 음성은 그렇다고 말한다
  await expect(select.locator('option')).toHaveText([
    '자동 (자연스러운 음성을 골라요)',
    'Nanami Online (Natural) · 온라인',
    'Ayumi',
    'Haruka',
  ])

  await page.getByRole('button', { name: '들어보기' }).click()
  const [first] = await spokenOf(page)
  expect(first).toMatchObject({ lang: 'ja-JP', rate: 0.9, voice: VOICES[2]!.name })
})

test('고른 음성과 속도가 들어보기에 쓰이고, 다시 열어도 남아 있다', async ({ page }) => {
  await installFakeSpeech(page, VOICES)
  await openSettings(page)

  await page.getByLabel('음성').selectOption({ label: 'Haruka' })
  await page.getByRole('group', { name: '소리 속도' }).getByRole('button', { name: '느리게' }).click()
  await page.getByRole('button', { name: '들어보기' }).click()
  const [spoke] = await spokenOf(page)
  expect(spoke).toMatchObject({ voice: VOICES[1]!.name, rate: 0.75 })

  // 기기에 기억된다 — 다시 열어도 그 선택이다
  await page.reload()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByLabel('음성')).toHaveValue(VOICES[1]!.name)
  await expect(
    page.getByRole('group', { name: '소리 속도' }).getByRole('button', { name: '느리게' }),
  ).toHaveAttribute('aria-pressed', 'true')
})

test('저장한 음성이 이 기기에 없으면 자동으로 돌아간다', async ({ page }) => {
  await installFakeSpeech(page, VOICES)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('yomenai:tts', JSON.stringify({ voice: 'Siri Voice 2', rate: 'normal' }))
    } catch {
      /* private mode */
    }
  })
  await openSettings(page)
  // 선택 칸은 「자동」을 가리키고, 들어보기는 자동 선택(신경망)으로 읽는다
  await expect(page.getByLabel('음성')).toHaveValue('')
  await page.getByRole('button', { name: '들어보기' }).click()
  expect((await spokenOf(page))[0]!.voice).toBe(VOICES[2]!.name)
})

test('일본어 음성이 하나도 없는 기기에서는 소리 그룹이 안 보인다', async ({ page }) => {
  await installFakeSpeech(page, [])
  await openSettings(page)
  await expect(page.getByRole('heading', { name: '소리' })).toHaveCount(0)
  await expect(page.getByLabel('음성')).toHaveCount(0)
})
