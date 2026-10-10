// 진단 소견 — 수준·원인·다음 걸음을 전문가가 말하는 순서의 문장으로 조립한다 (2026-10-09, 사용자 지시)
//
// **규칙 기반이다.** 모든 문장은 기록에서 뽑은 숫자에 붙고, 표본이 모자란 문단은 통째로 빠진다 —
// 지어낸 말이 나올 수 없고, 오프라인에서 되고, 테스트로 고정된다. 말투는 앱의 방침을 따른다:
// 당황 → 대처 순서, 달래는 말(「겁내지 마세요」)·막힘을 말하는 표현은 쓰지 않는다. 내려간 것을 부각하지 않는다.
//
// 핵심은 **역전**(더 어려운 코스는 안정인데 더 쉬운 코스가 흔들림)의 설명이다. 수준 판정은 코스마다
// 「최근 30회」라 하루 세션이 창을 채우면 판정이 뒤집힌다 — 문장은 창의 모양과 전체 기록을 사실로 말한다.
import { LEVEL_MIN_GRADES, LEVEL_MIN_IDIOMS, LEVEL_SOLID_RATE, type LevelProfile } from '../core/level.ts'
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

/** 기준 부근(`near`)인 코스 이름들 — 「산책로·뒷산」 */
function nearNames(level: LevelProfile): string {
  return level.near.map((b) => bandName(b)).join('·')
}

function levelParagraph(level: LevelProfile): Paragraph {
  const inv = findInversion(level)
  const { solidThrough, edge } = level
  const details: string[] = []
  // 총평이 말로 결론을 말하니, 이 항목은 숫자로 짧게 받친다 (2026-10-10 사용자 「세부 항목별 진단은 간략하게」)
  const parts: string[] = []
  if (inv !== null) {
    const row = scoredRows(level).find((r) => r.band === inv.solid)!
    parts.push(`안정 ${bandName(inv.solid)} ${pct(row.rate)}%`, `흔들림 ${inv.shaky.map((b) => bandName(b)).join('·')}`)
    details.push(`${bandName(inv.solid)} 코스는 최근 ${row.seen}회 정답률 ${pct(row.rate)}%로 안정이에요. 흔들리는 코스는 아래에서 기록으로 이유를 짚었어요.`)
  } else if (edge !== null && solidThrough !== null) {
    parts.push(`안정 ${bandName(solidThrough)}까지`, `경계 ${bandName(edge)}`)
  } else if (edge !== null) {
    parts.push(`흔들림 ${bandName(edge)}`)
  } else if (solidThrough !== null) {
    parts.push(`안정 ${bandName(solidThrough)}까지`, level.near.length > 0 ? '' : '벽 없음')
  }
  if (level.near.length > 0) parts.push(`기준 부근 ${nearNames(level)}`)
  if (parts.filter(Boolean).length === 0) parts.push('아직 수준을 말할 만큼 안 풀었어요.')

  // 표본이 모자라 판정을 못 내는 코스는 얼마나 더 쌓여야 하는지 말한다 (신규 사용자가 기다릴 만하게)
  for (const r of scoredRows(level)) {
    if (r.status === 'thin') {
      details.push(`${bandName(r.band)} 코스는 표본을 모으는 중이에요 — 채점 ${r.seen}/${LEVEL_MIN_GRADES}회 · 표현 ${r.idioms}/${LEVEL_MIN_IDIOMS}개.`)
    }
  }
  if (level.near.length > 0) {
    details.push('기준 부근은 정답률의 오차 범위가 안정 기준(80%)을 걸치고 있어 안정인지 흔들림인지 아직 가를 수 없다는 뜻이에요.')
  }
  const stable = scoredRows(level).reduce((s, r) => s + r.stable, 0)
  if (stable > 0) {
    parts.push(`숙지 ${stable}개`)
    details.push('숙지는 2주 넘게 안 잊는 표현이에요.')
  }
  return { key: 'level', title: '지금 수준', summary: parts.filter(Boolean).join(' · '), details }
}

/** 흔들리는 코스 하나를 기록으로 해부한다 */
function shakyParagraph(
  w: CourseWindow,
  windows: ReadonlyMap<Band, CourseWindow>,
  today: string,
  headwordOf: (id: string) => string | undefined,
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
  const comparable = [...windows.values()].filter((o) => o.allN >= LEVEL_MIN_GRADES)
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

  // 「흔들림」은 오차 범위까지 감안해도 문턱 아래라는 뜻이다 (2026-10-10 판정 기준 변경) — 그 사실을 숫자로 말한다
  const [lo, hi] = w.ci
  lines.push(
    `정답률 ${pct(w.correct / w.n)}%는 오차 범위(${pct(lo)}~${pct(hi)}%)까지 감안해도 안정 기준 ${pct(LEVEL_SOLID_RATE)}%보다 낮아요.`,
  )
  return { key: `shaky-${w.band}`, title: `${bandName(w.band)} — 최근 ${w.n}회`, summary: brief.join(' · '), details: lines }
}

/** 4주 선의 처음·끝 값. 점이 둘 미만이면 null */
function trendFacts(trends: AccuracyTrends) {
  const pts = trends.get('all')
  if (!pts || pts.length < 2) return null
  const a = pts[0]!
  const b = pts.at(-1)!
  return { from: pct(a.rate), to: pct(b.rate), range: `${md(a.date)}~${md(b.date)}` }
}

function trendParagraph(trends: AccuracyTrends): Paragraph | null {
  const f = trendFacts(trends)
  if (!f) return null
  const { from, to, range } = f
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

/**
 * 총평 — 소견의 결론을 맨 위에 얹는 두세 줄 (2026-10-10 사용자 「결론을 위에 총평으로」).
 * 수준 → 4주 흐름 → 다음 한 걸음 순이다. 항목별 진단과 같은 사실에서 조립해 서로 어긋나지 않는다.
 * 표본이 모자라면 비운다(그때는 「더 쌓이면」 문단이 말한다)
 */
export function buildOverall(input: DiagnosisInput): string[] {
  const { level } = input
  if (level.totalReadings < PRESCRIPTION_MIN_READINGS) return []
  const out: string[] = []
  const inv = findInversion(level)
  const { solidThrough, edge } = level
  if (inv !== null) {
    const names = inv.shaky.map((b) => bandName(b)).join('·')
    // 안정과 흔들림은 둘 다 오차 구간으로 가른 판정이라, 이 역전은 잡음이 아니라 뚜렷한 차이다
    out.push(
      `${bandName(inv.solid)} 코스까지 안정적으로 읽어요. 그런데 더 쉬운 ${names} 코스는 오차 범위를 감안해도 정답률이 안정 기준 ${pct(LEVEL_SOLID_RATE)}% 아래예요.`,
    )
  } else if (solidThrough !== null && edge !== null) {
    out.push(`${bandName(solidThrough)}까지 안정적으로 읽고, ${bandNameIga(edge)} 경계예요.`)
  } else if (edge !== null) {
    const below = level.near.filter((b) => b < edge)
    out.push(
      below.length > 0
        ? `${below.map((b) => bandName(b)).join('·')} 코스는 기준 부근이고, ${bandName(edge)} 코스부터 흔들려요.`
        : `${bandName(edge)} 코스부터 흔들려요.`,
    )
  } else if (solidThrough !== null && level.near.length > 0) {
    out.push(`${bandName(solidThrough)}까지 안정적으로 읽고, ${nearNames(level)} 코스는 기준 부근이에요.`)
  } else if (solidThrough !== null) {
    out.push(`${bandName(solidThrough)}까지 안정적으로 읽어요. 아직 벽을 안 만났어요.`)
  } else if (level.near.length > 0) {
    // 점 하나로 가르면 안 되는 자리 — 오차 범위가 문턱을 걸친다 (2026-10-10 판정 기준 변경)
    out.push(
      `${nearNames(level)} 코스는 정답률이 안정 기준 80% 부근이에요. 표본의 오차를 감안하면 안정인지 흔들림인지 아직 가를 수 없어요.`,
    )
  } else {
    out.push(
      `아직 수준을 말할 만큼 안 풀었어요. 코스마다 채점 ${LEVEL_MIN_GRADES}회·서로 다른 표현 ${LEVEL_MIN_IDIOMS}개가 쌓이면 판정해요.`,
    )
  }
  const f = trendFacts(input.trends)
  if (f) {
    out.push(
      f.to - f.from >= 3
        ? `최근 4주 정답률은 ${f.from}%에서 ${f.to}%로 올랐어요.`
        : `최근 4주 정답률은 ${f.to}%예요.`,
    )
  }
  const n = nextParagraph(input.next)
  if (n) out.push(`다음에는 ${n.summary}`)
  return out
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
    .filter((r) => r.status === 'shaky')
    .slice(0, 2)
  for (const row of shaky) {
    const w = input.windows.get(row.band as Band)
    if (w) out.push(shakyParagraph(w, input.windows, input.today, input.headwordOf))
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
