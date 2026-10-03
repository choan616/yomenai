// 소리 취향 — 설정에서 음성과 속도를 고르고 들어 보며, 고른 값이 실제 발화에 쓰인다 (2026-10-03)
//
// 사용자 지적 「tts가 너무 딱딱하다」. 소리는 코드가 못 들으므로 기기에 있는 음성을 직접 고르게 했다.
// 실제 오디오는 검증하지 않는다 — `speechSynthesis` 를 가짜로 바꿔 어떤 음성·속도로 발화했는지만 기록한다.
import { expect, test, type Page } from '@playwright/test'

interface Spoken {
  text: string
  lang: string
  rate: number
  volume: number
  voice: string | null
  uri: string | null
}

/** 가짜 음성 셋과 발화 기록 — 브라우저 전역을 통째로 바꾼다 */
async function installFakeSpeech(
  page: Page,
  voices: { name: string; local: boolean; uri?: string }[],
): Promise<void> {
  await page.addInitScript((vs) => {
    const spoken: unknown[] = []
    const fake = {
      getVoices: () =>
        vs.map((v) => ({
          name: v.name,
          voiceURI: v.uri ?? v.name,
          lang: 'ja-JP',
          localService: v.local,
          default: false,
        })),
      speak: (u: {
        text: string
        lang: string
        rate: number
        volume: number
        voice: { name: string; voiceURI: string } | null
      }) => {
        spoken.push({
          text: u.text,
          lang: u.lang,
          rate: u.rate,
          volume: u.volume,
          voice: u.voice?.name ?? null,
          uri: u.voice?.voiceURI ?? null,
        })
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
      volume = 1
      voice: { name: string; voiceURI: string } | null = null
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

/** 큐에 들어간 발화 전부 — 깨우기(음량 0)도 들어 있다 */
const queueOf = (page: Page): Promise<Spoken[]> =>
  page.evaluate(() => (window as unknown as { __spoken: Spoken[] }).__spoken)

/** 실제로 소리가 나는 발화만 — 발음 보정이 앞에 넣는 음량 0 의 깨우기는 뺀다 */
const spokenOf = async (page: Page): Promise<Spoken[]> =>
  (await queueOf(page)).filter((s) => s.volume !== 0)

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

// 실기기(iPhone)에서 발견한 결함 (2026-10-03) — iOS 는 `Kyoko` 를 같은 이름으로 둘 내준다.
// 이름으로 식별하던 때는 선택지가 `Kyoko` `Kyoko` 로 똑같이 보였고 둘째를 고를 방법이 없었다
test('이름이 같은 음성이 둘이어도 구분되고 둘째를 고를 수 있다', async ({ page }) => {
  const compact = 'com.apple.voice.compact.ja-JP.Kyoko'
  const enhanced = 'com.apple.voice.enhanced.ja-JP.Kyoko'
  await installFakeSpeech(page, [
    { name: 'Kyoko', local: true, uri: compact },
    { name: 'Kyoko', local: true, uri: enhanced },
  ])
  await openSettings(page)

  const select = page.getByLabel('음성')
  // 선택지가 서로 다르다 — 품질 표지를 붙였다. 자동 선택은 고음질판을 앞세운다
  await expect(select.locator('option')).toHaveText([
    '자동 (자연스러운 음성을 골라요)',
    'Kyoko · 고음질',
    'Kyoko · 기본',
  ])
  await page.getByRole('button', { name: '들어보기' }).click()
  expect((await spokenOf(page))[0]!.uri).toBe(enhanced)

  // 둘째(기본)를 골라 들어 본다 — 같은 이름이어도 그쪽으로 읽는다
  await select.selectOption({ label: 'Kyoko · 기본' })
  await page.getByRole('button', { name: '들어보기' }).click()
  expect((await spokenOf(page))[1]!.uri).toBe(compact)

  // 다시 열어도 그 선택이 남는다
  await page.reload()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(page.getByLabel('음성')).toHaveValue(compact)
})

// 장음·촉음이 어색하고 탁음이 맨 앞에 오면 끊긴다는 지적 (2026-10-03, iPhone Kyoko).
// 효과는 코드가 못 들어서 끄고 켜며 비교하게 한 스위치다 — 켜고 끈 상태가 실제 발화에 어떻게 닿는지 본다
// 기본은 끔이다 — 사용자가 켜고 들어 본 뒤 「보정을 하는 것이 오히려 부자연스럽다」고 했다 (2026-10-03)
test('발음 보정은 기본으로 꺼져 있어 원문 그대로 한 번만 읽는다', async ({ page }) => {
  await installFakeSpeech(page, VOICES)
  await openSettings(page)

  const off = page.getByRole('group', { name: '발음 보정' }).getByRole('button', { name: '끔' })
  await expect(off).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '들어보기' }).click()
  const queue = await queueOf(page)
  expect(queue).toHaveLength(1)
  expect(queue[0]).toMatchObject({ text: 'がっこう', volume: 1 })
})

test('보정을 켜면 장음을 고치고 앞에 깨우기 발화를 넣고, 다시 열어도 켜져 있다', async ({ page }) => {
  await installFakeSpeech(page, VOICES)
  await openSettings(page)

  const group = page.getByRole('group', { name: '발음 보정' })
  await group.getByRole('button', { name: '켬' }).click()
  await page.getByRole('button', { name: '들어보기' }).click()
  const queue = await queueOf(page)
  // 큐 순서: 음량 0 의 깨우기 → 진짜 발화. 진짜는 장음이 ー 로 바뀐 말이다
  expect(queue).toHaveLength(2)
  expect(queue[0]).toMatchObject({ volume: 0 })
  expect(queue[1]).toMatchObject({ text: 'がっこー', volume: 1 })

  await page.reload()
  await page.getByRole('button', { name: '설정', exact: true }).click()
  await expect(
    page.getByRole('group', { name: '발음 보정' }).getByRole('button', { name: '켬' }),
  ).toHaveAttribute('aria-pressed', 'true')
})
