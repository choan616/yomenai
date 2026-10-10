// 진단 소견 — 역전 설명, 표본 부족 시 생략, 근거 숫자, 금지어 (2026-10-09 사용자 백업의 모양을 그대로 본뜬다)
import { describe, expect, it } from 'vitest'
import { buildDiagnosis, buildOverall, findInversion, type DiagnosisInput, type Paragraph } from './diagnosis.ts'
import { accuracyTrends } from '../core/accuracyTrend.ts'
import { courseWindows } from '../core/courseWindow.ts'
import { buildLevel } from '../core/level.ts'
import type { Band } from '../lib/bands.ts'
import type { MistakeType, ReviewEvent } from '../core/types.ts'

const band: Record<string, Band> = { a: 0, b: 1, c: 2, d: 3 }
const TODAY = '2026-10-09'
let n = 0
const ev = (id: string, correct: boolean, day: string, t: MistakeType | null = null): ReviewEvent => ({
  id: `e${n++}`,
  userId: 'local',
  deviceId: 'd',
  at: new Date(`${day}T12:00:00`).getTime() + n,
  idiomId: id,
  cardType: 'reading',
  mistakeType: t,
  deletedAt: null,
  type: 'review',
  grade: correct ? 3 : 1,
  answer: '',
  expected: '',
  correct,
  elapsedMs: 1,
})
const many = (id: string, c: number, w: number, day: string, t: MistakeType | null = null) => [
  ...Array.from({ length: c }, () => ev(id, true, day)),
  ...Array.from({ length: w }, () => ev(id, false, day, t)),
]

/** 사용자 백업의 모양 — 산책로는 옛날 길게 잘했고 오늘 하루 장음을 몰아 틀렸다. 위 코스들은 안정 */
function scenario(): DiagnosisInput {
  const events: ReviewEvent[] = [
    ...many('a', 60, 10, '2026-09-20'),
    // 오늘 30회: 22 정답, 오답 8 중 7이 장음(訴訟 ×2 · 報酬 ×2 반복)
    ...many('a', 22, 0, TODAY),
    ev('x1', false, TODAY, 'CHOON'),
    ev('x1', false, TODAY, 'CHOON'),
    ev('x2', false, TODAY, 'CHOON'),
    ev('x2', false, TODAY, 'CHOON'),
    ev('x3', false, TODAY, 'CHOON'),
    ev('x4', false, TODAY, 'CHOON'),
    ev('x5', false, TODAY, 'CHOON'),
    ev('x6', false, TODAY, 'ONYOMI_CHOICE'),
    ...many('b', 25, 5, '2026-10-01'),
    ...many('c', 25, 5, '2026-10-02'),
    ...many('d', 26, 4, '2026-10-03'),
  ]
  const ids: Record<string, Band> = { ...band, x1: 0, x2: 0, x3: 0, x4: 0, x5: 0, x6: 0 }
  const bandOf = (id: string) => ids[id]
  return {
    level: buildLevel(events, bandOf),
    windows: courseWindows(events, bandOf, (e) => e.mistakeType),
    trends: accuracyTrends(events, bandOf, TODAY),
    mistakes: [
      { label: '장음', count: 40 },
      { label: '연탁', count: 20 },
    ],
    totalWrong: 100,
    pace: { medianMs: 1000, slow: Array.from({ length: 10 }, (_, i) => ({ idiomId: `s${i}`, elapsedMs: 9000 })), counted: 100 },
    next: { kind: 'MISTAKE_RULE', type: 'CHOON', count: 40, share: 0.4 },
    today: TODAY,
    headwordOf: (id) => ({ x1: '訴訟', x2: '報酬' })[id],
  }
}

/** 요약과 세부를 한 덩어리로 */
const all = (p: Paragraph) => [p.summary, ...p.details]
const text = (ps: Paragraph[]) => ps.flatMap(all).join('\n')

describe('buildDiagnosis — 역전', () => {
  const input = scenario()

  it('더 어려운 코스가 안정이고 쉬운 코스가 흔들리면 역전으로 잡는다', () => {
    expect(findInversion(input.level)).toEqual({ solid: 3, shaky: [0] })
  })

  it('수준 문단이 역전을 말하고, 흔들리는 코스를 기록으로 해부한다', () => {
    const ps = buildDiagnosis(input)
    const level = ps.find((p) => p.key === 'level')!
    // 늘 보이는 요약은 한 줄이고, 근거는 세부에 있다
    expect(level.summary).toBe('안정 능선 87% · 흔들림 산책로')
    expect(level.details[0]).toContain('능선 코스는 최근 30회 정답률')

    const shaky = ps.find((p) => p.key === 'shaky-0')!
    expect(shaky.summary).toMatch(/^오늘 하루 치 · 전체 기록 \d+% · 장음 7\/8$/)
    const t = shaky.details.join('\n')
    expect(t).toContain('최근 30회가 모두 오늘 하루 치예요')
    expect(t).toMatch(/전체 기록은 \d+%\(\d+회\)예요/)
    expect(t).toContain('틀린 8개 중 7개가 장음이에요')
    expect(t).toContain('訴訟 ×2 · 報酬 ×2')
    expect(t).toContain('안정 문턱 80%가 그 안에 들어요')
    expect(t).toContain('며칠 더 풀면 달라질 수 있어요')
  })

  it('전체 기록이 비교 가능한 코스 중 가장 높을 때만 그렇게 말한다', () => {
    const run = (before: number) => {
      const events = [
        ...many('a', before, 0, '2026-09-20'),
        ...many('a', 22, 8, TODAY, 'CHOON'),
        ...many('b', 25, 5, '2026-10-01'),
        ...many('c', 25, 5, '2026-10-02'),
        ...many('d', 26, 4, '2026-10-03'),
      ]
      const bandOf = (id: string) => band[id]
      const t = buildDiagnosis({
        ...input,
        level: buildLevel(events, bandOf),
        windows: courseWindows(events, bandOf, (e) => e.mistakeType),
      })
      return t.find((p) => p.key === 'shaky-0')!.details.join(' ')
    }
    expect(run(80)).toContain('개 코스 중 가장 높은 값이에요') // 전체 102/110
    expect(run(0)).not.toContain('가장 높은 값이에요') // 전체 22/30 = 73%
  })

  it('나머지 문단도 근거 숫자와 함께 나온다', () => {
    const ps = buildDiagnosis(input)
    expect(ps.map((p) => p.key)).toEqual(['level', 'shaky-0', 'trend', 'mistake', 'pace', 'next'])
    expect(ps.find((p) => p.key === 'mistake')!.summary).toBe('오답의 40%는 장음, 20%는 연탁 유형이에요.')
    const pace = ps.find((p) => p.key === 'pace')!
    expect(pace.summary).toBe('맞힌 표현의 10%는 한참 걸려서 읽었어요.')
    expect(pace.details[0]).toContain('100개 중 10개')
    expect(ps.find((p) => p.key === 'next')!.summary).toContain('장음 규칙')
    // 요약만으로 읽히는 문단은 펼침이 없다
    for (const k of ['trend', 'mistake', 'next']) expect(ps.find((p) => p.key === k)!.details).toEqual([])
  })

  it('말투 방침 — 달래는 말과 막힘을 말하는 표현이 없다', () => {
    const t = text(buildDiagnosis(input))
    for (const bad of ['겁', '걱정', '괜찮', '막혀', '막힘', '포기', '실패']) expect(t).not.toContain(bad)
  })
})

describe('buildOverall — 총평', () => {
  it('역전이면 수준 → 4주 흐름 → 다음 한 걸음 순으로 결론을 말한다', () => {
    const lines = buildOverall(scenario())
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe(
      '능선 코스까지 안정적으로 읽어요. 더 쉬운 산책로 코스가 흔들리는 건 최근 하루 이틀 기록의 영향이 커서 아직 단단한 판정은 아니에요.',
    )
    expect(lines[1]).toMatch(/^최근 4주 정답률은 /)
    expect(lines[2]).toBe('다음에는 장음 규칙을 읽고, 같은 유형을 대조해서 풀어 보세요.')
  })

  it('항목별 진단과 같은 사실에서 나온다 — 흔들리는 코스 이름이 둘 다에 있다', () => {
    const input = scenario()
    expect(buildOverall(input)[0]).toContain('산책로')
    expect(buildDiagnosis(input).find((p) => p.key === 'level')!.summary).toContain('흔들림 산책로')
  })

  it('역전이 아니면 경계로 말하고, 표본이 모자라면 비운다', () => {
    const events = [...many('a', 28, 2, '2026-10-01'), ...many('b', 18, 12, '2026-10-02')]
    const bandOf = (id: string) => band[id]
    const base = scenario()
    const input: DiagnosisInput = {
      ...base,
      level: buildLevel(events, bandOf),
      windows: courseWindows(events, bandOf, (e) => e.mistakeType),
      next: null,
    }
    expect(buildOverall(input)[0]).toBe('산책로까지 안정적으로 읽고, 뒷산이 경계예요.')
    // 읽기가 문턱(30회)에 못 미치면 비운다 — 「더 쌓이면」 문단이 말한다
    const few = many('a', 5, 2, TODAY)
    expect(buildOverall({ ...input, level: buildLevel(few, bandOf) })).toEqual([])
  })

  it('말투 방침을 지킨다', () => {
    const t = buildOverall(scenario()).join(' ')
    for (const bad of ['겁', '걱정', '괜찮', '막혀', '막힘', '포기', '실패']) expect(t).not.toContain(bad)
  })
})

describe('buildDiagnosis — 표본·예외', () => {
  it('읽기가 문턱 미만이면 한 문단만 낸다', () => {
    const events = many('a', 5, 2, TODAY)
    const bandOf = (id: string) => band[id]
    const ps = buildDiagnosis({
      ...scenario(),
      level: buildLevel(events, bandOf),
      windows: courseWindows(events, bandOf, (e) => e.mistakeType),
    })
    expect(ps).toHaveLength(1)
    expect(ps[0]!.summary).toContain('더 쌓이면 소견을 쓸 수 있어요')
  })

  it('역전이 아니면 흔들리는 코스의 해부는 경계로만 말한다', () => {
    const events = [...many('a', 28, 2, '2026-10-01'), ...many('b', 18, 12, '2026-10-02')]
    const bandOf = (id: string) => band[id]
    const base = scenario()
    const input: DiagnosisInput = {
      ...base,
      level: buildLevel(events, bandOf),
      windows: courseWindows(events, bandOf, (e) => e.mistakeType),
      totalWrong: 0,
      mistakes: [],
      pace: null,
      next: null,
    }
    expect(findInversion(input.level)).toBeNull()
    const ps = buildDiagnosis({ ...input, level: { ...input.level, totalReadings: 60 } })
    expect(ps[0]!.summary).toBe('안정 산책로까지 · 경계 뒷산')
    expect(ps.some((p) => p.key === 'mistake' || p.key === 'pace' || p.key === 'next')).toBe(false)
  })

  it('표본이 60회쯤이면 구간이 문턱을 안 품을 수 있다 — 그때는 오차 문장을 안 쓴다', () => {
    const events = [...many('a', 0, 30, TODAY), ...many('b', 30, 0, '2026-10-01')]
    const bandOf = (id: string) => band[id]
    const input = {
      ...scenario(),
      level: buildLevel(events, bandOf),
      windows: courseWindows(events, bandOf, (e) => e.mistakeType),
    }
    const shaky = buildDiagnosis({ ...input, level: { ...input.level, totalReadings: 60 } }).find((p) => p.key === 'shaky-0')!
    expect(all(shaky).join('\n')).not.toContain('오차')
  })
})
