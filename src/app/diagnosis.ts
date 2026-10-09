// 진단 소견 — 수준·원인·다음 걸음을 전문가가 말하는 순서의 문장으로 조립한다 (2026-10-09, 사용자 지시)
//
// **규칙 기반이다.** 모든 문장은 기록에서 뽑은 숫자에 붙고, 표본이 모자란 문단은 통째로 빠진다 —
// 지어낸 말이 나올 수 없고, 오프라인에서 되고, 테스트로 고정된다. 말투는 앱의 방침을 따른다:
// 당황 → 대처 순서, 달래는 말(「겁내지 마세요」)·막힘을 말하는 표현은 쓰지 않는다. 내려간 것을 부각하지 않는다.
//
// 핵심은 **역전**(더 어려운 코스는 안정인데 더 쉬운 코스가 흔들림)의 설명이다. 수준 판정은 코스마다
// 「최근 30회」라 하루 세션이 창을 채우면 판정이 뒤집힌다 — 문장은 창의 모양과 전체 기록을 사실로 말한다.
import { LEVEL_MIN_SEEN, LEVEL_SOLID_RATE, LEVEL_WINDOW, type LevelProfile } from '../core/level.ts'
import { PRESCRIPTION_MIN_READINGS, type Prescription } from '../core/prescription.ts'
import type { AccuracyTrends } from '../core/accuracyTrend.ts'
import type { CourseWindow } from '../core/courseWindow.ts'
import type { PaceProfile } from '../core/pace.ts'
import { bandName, bandNameIga, type Band } from '../lib/bands.ts'
import { mistakeHint, mistakeLabel } from '../study/mistakeLabels.ts'

export interface Paragraph {
  key: string
  title: string
  /** 늘 보이는 한 줄 — 이것만 읽어도 결론이 선다 (2026-10-10 사용자 「간략 정보를 노출하고 세부는 요청에 의해」) */
  summary: string
  /** 「자세히」를 눌러야 보이는 근거 문장들. 없으면 펼침 버튼이 없다 */
  details: string[]
}

export interface DiagnosisInput {
  level: LevelProfile
  windows: ReadonlyMap<Band, CourseWindow>
  trends: AccuracyTrends
  /** 오답 유형 분포(많은 순) — 리포트의 오답 행과 같은 값 */
  mistakes: readonly { label: string; count: number }[]
  totalWrong: number
  pace: PaceProfile | null
  next: Prescription | null
  /** 오늘의 날짜 키 */
  today: string
  /** 창 안 반복 오답의 표기 */
  headwordOf: (idiomId: string) => string | undefined
}

const pct = (r: number) => Math.round(r * 100)
/** 받침이 있으면 「이에요」, 없으면 「예요」 */
const iEyo = (word: string) => ((word.charCodeAt(word.length - 1) - 0xac00) % 28 !== 0 ? '이에요' : '예요')
const md = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}

/** 수준을 재는 코스(0~3)만 */
function scoredRows(level: LevelProfile) {
  return level.bands.filter((b) => b.band <= 3)
}

/**
 * 역전 — 가장 높은 안정 코스보다 **아래**에서 흔들리는 코스가 있다.
 * 수준 시트가 소견으로 안내하는 조건이기도 하다
 */
export function findInversion(level: LevelProfile): { solid: Band; shaky: Band[] } | null {
  const rows = scoredRows(level)
  const solid = rows.filter((r) => r.status === 'solid').map((r) => r.band as Band)
  if (solid.length === 0) return null
  const top = Math.max(...solid) as Band
  const shaky = rows.filter((r) => r.status === 'shaky' && r.band < top).map((r) => r.band as Band)
  return shaky.length > 0 ? { solid: top, shaky } : null
}

function levelParagraph(level: LevelProfile): Paragraph {
  const inv = findInversion(level)
  const { solidThrough, edge } = level
  const details: string[] = []
  let summary: string
  if (inv !== null) {
    const row = scoredRows(level).find((r) => r.band === inv.solid)!
    summary = `${bandName(inv.solid)} 코스는 안정인데, 더 쉬운 ${inv.shaky.map((b) => bandName(b)).join('·')} 코스는 흔들려요.`
    details.push(`${bandName(inv.solid)} 코스는 최근 ${row.seen}회 정답률 ${pct(row.rate)}%로 안정이에요. 흔들리는 코스는 아래에서 기록으로 이유를 짚었어요.`)
  } else if (edge !== null && solidThrough !== null) {
    summary = `${bandName(solidThrough)}까지 안정, ${bandNameIga(edge)} 경계예요.`
  } else if (edge !== null) {
    summary = `${bandName(edge)}부터 흔들려요.`
  } else if (solidThrough !== null) {
    summary = `${bandName(solidThrough)}까지 안정이에요. 아직 벽을 안 만났어요.`
  } else {
    summary = '아직 수준을 말할 만큼 안 풀었어요.'
  }
  const stable = scoredRows(level).reduce((s, r) => s + r.stable, 0)
  if (stable > 0) details.push(`2주 넘게 안 잊는 표현은 ${stable}개예요.`)
  return { key: 'level', title: '지금 수준', summary, details }
}

/** 흔들리는 코스 하나를 기록으로 해부한다 */
function shakyParagraph(
  w: CourseWindow,
  windows: ReadonlyMap<Band, CourseWindow>,
  today: string,
  headwordOf: (id: string) => string | undefined,
  /** 앞 문단이 이미 같은 해석을 말했나 — 둘째 코스에서 되풀이하지 않는다 */
  explained: boolean,
): Paragraph {
  const lines: string[] = []
  const when = w.lastDate === today ? '오늘' : md(w.lastDate)
  /** 접어 두기 전에 보이는 한 줄 — 창의 폭 · 전체 기록 · 오답 쏠림 */
  const brief: string[] = [w.days === 1 ? `${when} 하루 치` : `${w.days}일 치`]
  lines.push(
    w.days === 1
      ? `최근 ${w.n}회가 모두 ${when} 하루 치예요.`
      : `최근 ${w.n}회가 ${w.days}일(${md(w.firstDate)}~${md(w.lastDate)})에 걸쳐 있어요.`,
  )

  const allRate = w.allCorrect / w.allN
  const comparable = [...windows.values()].filter((o) => o.allN >= LEVEL_WINDOW)
  const best = comparable.length >= 2 && comparable.every((o) => o.allCorrect / o.allN <= allRate)
  brief.push(`전체 기록 ${pct(allRate)}%`)
  lines.push(
    `이 코스의 전체 기록은 ${pct(allRate)}%(${w.allN}회)예요.` +
      (best ? ` 비교할 수 있는 ${comparable.length}개 코스 중 가장 높은 값이에요.` : ''),
  )

  const top = w.wrongTypes[0]
  if (w.wrongN >= 3 && top && top.type !== null && top.count / w.wrongN >= 0.5) {
    brief.push(`${mistakeLabel(top.type)} ${top.count}/${w.wrongN}`)
    lines.push(`틀린 ${w.wrongN}개 중 ${top.count}개가 ${mistakeLabel(top.type)}${iEyo(mistakeLabel(top.type))}. ${mistakeHint(top.type)}`)
  }
  const rep = w.repeated
    .map((r) => [headwordOf(r.idiomId), r.count] as const)
    .filter((r): r is readonly [string, number] => r[0] !== undefined)
  if (rep.length > 0) {
    lines.push(`같은 표현을 여러 번 틀렸어요 — ${rep.map(([h, c]) => `${h} ×${c}`).join(' · ')}.`)
  }

  const [lo, hi] = w.ci
  const solid = LEVEL_SOLID_RATE
  if (lo < solid && solid < hi) {
    lines.push(
      `표본이 ${w.n}회라 실제 정답률은 ${pct(lo)}~${pct(hi)}% 사이일 수 있고, 안정 문턱 ${pct(solid)}%가 그 안에 들어요.`,
    )
    if (w.days <= 2 && !explained) lines.push('하루 이틀의 세션이 판정을 크게 좌우한 상태라, 며칠 더 풀면 달라질 수 있어요.')
  }
  return { key: `shaky-${w.band}`, title: `${bandName(w.band)} — 최근 ${w.n}회`, summary: brief.join(' · '), details: lines }
}

function trendParagraph(trends: AccuracyTrends): Paragraph | null {
  const pts = trends.get('all')
  if (!pts || pts.length < 2) return null
  const a = pts[0]!
  const b = pts.at(-1)!
  const from = pct(a.rate)
  const to = pct(b.rate)
  const range = `${md(a.date)}~${md(b.date)}`
  return {
    key: 'trend',
    title: '최근 4주',
    summary:
      to - from >= 3
        ? `정답률이 ${from}%에서 ${to}%로 올랐어요 (${range}).`
        : `정답률은 ${from}%에서 ${to}%예요 (${range}).`,
    details: [],
  }
}

function mistakeParagraph(
  mistakes: DiagnosisInput['mistakes'],
  totalWrong: number,
): Paragraph | null {
  if (totalWrong < 20 || mistakes.length === 0) return null
  const [a, b] = mistakes
  const summary = b
    ? `오답의 ${pct(a!.count / totalWrong)}%는 ${a!.label}, ${pct(b.count / totalWrong)}%는 ${b.label} 유형이에요.`
    : `오답의 ${pct(a!.count / totalWrong)}%는 ${a!.label} 유형이에요.`
  return { key: 'mistake', title: '많이 틀리는 유형', summary, details: [] }
}

function paceParagraph(pace: PaceProfile | null): Paragraph | null {
  if (!pace) return null
  return {
    key: 'pace',
    title: '읽는 속도',
    summary: `맞힌 표현의 ${pct(pace.slow.length / pace.counted)}%는 한참 걸려서 읽었어요.`,
    details: [`맞힌 표현 ${pace.counted}개 중 ${pace.slow.length}개는 바로 안 나왔어요.`],
  }
}

function nextParagraph(next: Prescription | null): Paragraph | null {
  if (!next) return null
  let line: string | null = null
  switch (next.kind) {
    case 'MISTAKE_RULE':
      line = `${mistakeLabel(next.type)} 규칙을 읽고, 같은 유형을 대조해서 풀어 보세요.`
      break
    case 'ONYOMI':
      line = `${next.kanji}의 ${next.base} 음독을 집중해서 풀어 보세요.`
      break
    case 'BAND':
      line = `${bandName(next.band)} 코스를 더 풀어서 판정을 확실하게 해 두세요.`
      break
    case 'MORE_DATA':
      return null
  }
  return { key: 'next', title: '다음 한 걸음', summary: line, details: [] }
}

/** 소견 전체. 표본이 모자라면 한 문단만 낸다 */
export function buildDiagnosis(input: DiagnosisInput): Paragraph[] {
  const { level } = input
  if (level.totalReadings < PRESCRIPTION_MIN_READINGS) {
    return [
      {
        key: 'more',
        title: '지금 수준',
        summary: `지금까지 읽기 ${level.totalReadings}회예요. ${PRESCRIPTION_MIN_READINGS - level.totalReadings}회쯤 더 쌓이면 소견을 쓸 수 있어요.`,
        details: [],
      },
    ]
  }
  const out: Paragraph[] = [levelParagraph(level)]

  // 흔들리는 코스 — 표본이 판정 문턱 이상인 것만, 낮은 코스부터 둘까지
  const shaky = scoredRows(level)
    .filter((r) => r.status === 'shaky' && r.seen >= LEVEL_MIN_SEEN)
    .slice(0, 2)
  for (const row of shaky) {
    const w = input.windows.get(row.band as Band)
    if (w) {
      const explained = out.some((p) => p.details.some((l) => l.startsWith('하루 이틀의 세션이')))
      out.push(shakyParagraph(w, input.windows, input.today, input.headwordOf, explained))
    }
  }
  for (const p of [
    trendParagraph(input.trends),
    mistakeParagraph(input.mistakes, input.totalWrong),
    paceParagraph(input.pace),
    nextParagraph(input.next),
  ]) {
    if (p) out.push(p)
  }
  return out
}
