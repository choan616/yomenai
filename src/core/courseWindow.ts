// 코스별 판정 창 해부 — 흔들리는 코스가 왜 흔들리는지 기록에서 뽑는 사실들 (진단 소견)
//
// 수준 판정은 코스마다 「최근 7일(모자라면 최근 100회)」 정답률로 한다(`selectWindow`·`buildLevel`). 그 창이
// 코스마다 걸친 기간이 다르고, 하루 세션이 창을 채울 수 있다 — 쉬운 코스가 흔들리고 어려운 코스가 안정인
// 역전은 그래서 생긴다(2026-10-09 사용자 백업: 산책로 전체 기록은 77% 로 최고인데 옛 「최근 30회」가 오늘 하루
// 치라 73%). 이 모듈은 창의 모양(걸친 날·반복 오답·오답 유형)과 전체 기간 값을 센다. 문장은 만들지 않는다.
import { dateKey } from './attendance.ts'
import { LEVEL_MAX_BAND, selectWindow, type WindowEntry } from './level.ts'
import { compareEvents, type LearningEvent, type MistakeType } from './types.ts'
import { wilson } from './wilson.ts'
import type { Band } from '../lib/bands.ts'

type Review = Extract<LearningEvent, { type: 'review' }>

export interface CourseWindow {
  band: Band
  /** 판정 창의 채점 수·정답 수 */
  n: number
  correct: number
  /** 창이 걸친 날 수와 처음·마지막 날(`YYYY-MM-DD`) */
  days: number
  firstDate: string
  lastDate: string
  /** 창의 서로 다른 표현 수 */
  idioms: number
  /** 전체 기간의 채점 수·정답 수 */
  allN: number
  allCorrect: number
  /** 창 안의 오답 수와 유형별 개수(많은 순). 이름이 안 붙은 오답은 type 이 null */
  wrongN: number
  wrongTypes: { type: MistakeType | null; count: number }[]
  /** 창 안에서 두 번 이상 틀린 숙어(많은 순, 최대 3) */
  repeated: { idiomId: string; count: number }[]
  /** 창 정답률의 Wilson 95% 구간(0~1) */
  ci: [number, number]
}

export function courseWindows(
  events: readonly LearningEvent[],
  bandOf: (idiomId: string) => Band | undefined,
  /** 오답 유형 — 화면과 같은 재분류(`reclassifier`)를 넘긴다 */
  typeOf: (e: Review) => MistakeType | null,
): Map<Band, CourseWindow> {
  type Row = WindowEntry & { e: Review }
  const rows = new Map<Band, Row[]>()
  for (const e of [...events].sort(compareEvents)) {
    if (e.type !== 'review' || e.cardType !== 'reading' || e.deletedAt !== null) continue
    const band = bandOf(e.idiomId)
    if (band === undefined || band > LEVEL_MAX_BAND) continue
    const row: Row = { date: dateKey(e.at), correct: e.correct, idiomId: e.idiomId, e }
    const list = rows.get(band)
    if (list) list.push(row)
    else rows.set(band, [row])
  }

  const out = new Map<Band, CourseWindow>()
  for (const [band, all] of rows) {
    const win = selectWindow(all)
    const dates = win.map((r) => r.date)
    const correct = win.filter((r) => r.correct).length

    const types = new Map<MistakeType | null, number>()
    const perIdiom = new Map<string, number>()
    for (const r of win) {
      if (r.correct) continue
      const t = typeOf(r.e)
      types.set(t, (types.get(t) ?? 0) + 1)
      perIdiom.set(r.idiomId, (perIdiom.get(r.idiomId) ?? 0) + 1)
    }

    out.set(band, {
      band,
      n: win.length,
      correct,
      days: new Set(dates).size,
      firstDate: dates[0]!,
      lastDate: dates.at(-1)!,
      idioms: new Set(win.map((r) => r.idiomId)).size,
      allN: all.length,
      allCorrect: all.filter((r) => r.correct).length,
      wrongN: win.length - correct,
      wrongTypes: [...types].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count),
      repeated: [...perIdiom]
        .filter(([, count]) => count >= 2)
        .map(([idiomId, count]) => ({ idiomId, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      ci: wilson(correct, win.length),
    })
  }
  return out
}
