// 정체기의 모양을 잰다 — 판정 창 정답률이 상습 오답 표현과 나머지로 어떻게 갈리는지 (2026-10-24).
//
// PLAN §11 「지속과 진단」의 근거 숫자를 다시 내는 스크립트다. 최신 백업을 넣고 돌려 비교한다.
// 상습 표현 = 누적 오답 CHRONIC_WRONG 회 이상인 읽기 카드. 판단은 사람이 한다 — 숫자만 낸다.
//
// 입력 — data/events/*.json (앱 백업 또는 Drive 의 reviews-*.json). 같은 id 는 한 번만 센다.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareEvents, type LearningEvent, type ReviewEvent } from '../src/core/types.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

/** 누적 오답이 이만큼이면 상습 표현으로 본다 */
export const CHRONIC_WRONG = 3
const DAY_MS = 864e5
/** 판정 창(`selectWindow`)의 날 수와 같다 */
const WINDOW_DAYS = 7

export interface Tally {
  n: number
  ok: number
}

export interface PlateauProfile {
  /** 읽기 카드를 한 번이라도 푼 표현 수 */
  idioms: number
  wrongTotal: number
  chronic: number
  chronicWrong: number
  /** 상습 표현 중 같은 오답을 두 번 이상 낸 것 */
  sameWrongRepeated: number
  /** 상습 표현이 맞힌 바로 다음 만남에서 틀린 비율의 분모·분자 */
  relapse: { afterCorrect: number; wrongNext: number }
  /** 마지막 이벤트로부터 7일 창. 상습 여부는 창 시작 전 오답으로 판정한다 */
  window: { chronic: Tally; rest: Tally }
}

export function plateauProfile(events: readonly LearningEvent[]): PlateauProfile | null {
  const reads = events.filter(
    (e): e is ReviewEvent => e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null,
  )
  if (reads.length === 0) return null
  reads.sort(compareEvents)

  const byIdiom = new Map<string, ReviewEvent[]>()
  for (const e of reads) {
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
  }

  let wrongTotal = 0
  let chronicWrong = 0
  let sameWrongRepeated = 0
  const relapse = { afterCorrect: 0, wrongNext: 0 }
  const chronic = new Set<string>()
  for (const [id, list] of byIdiom) {
    const wrongs = list.filter((e) => !e.correct)
    wrongTotal += wrongs.length
    if (wrongs.length < CHRONIC_WRONG) continue
    chronic.add(id)
    chronicWrong += wrongs.length
    const answers = new Map<string, number>()
    for (const e of wrongs) answers.set(e.answer, (answers.get(e.answer) ?? 0) + 1)
    if (Math.max(...answers.values()) >= 2) sameWrongRepeated++
    for (let i = 0; i < list.length - 1; i++) {
      if (!list[i]!.correct) continue
      relapse.afterCorrect++
      if (!list[i + 1]!.correct) relapse.wrongNext++
    }
  }

  // 창 안의 상습 여부는 **창 시작 전 오답으로만** 가른다. 전 기록으로 가르면 창 안에서 틀린 표현이
  // 상습으로 들어가 상습 정답률이 저절로 낮게 나온다(2026-10-24 정정 — 61.7% 대 83.1% 가 그 착시였다)
  const since = reads[reads.length - 1]!.at - WINDOW_DAYS * DAY_MS
  const wrongBefore = new Map<string, number>()
  for (const e of reads) {
    if (e.at > since) break
    if (!e.correct) wrongBefore.set(e.idiomId, (wrongBefore.get(e.idiomId) ?? 0) + 1)
  }
  const window = { chronic: { n: 0, ok: 0 }, rest: { n: 0, ok: 0 } }
  for (const e of reads) {
    if (e.at <= since) continue
    const t = (wrongBefore.get(e.idiomId) ?? 0) >= CHRONIC_WRONG ? window.chronic : window.rest
    t.n++
    if (e.correct) t.ok++
  }

  return {
    idioms: byIdiom.size,
    wrongTotal,
    chronic: chronic.size,
    chronicWrong,
    sameWrongRepeated,
    relapse,
    window,
  }
}

function pct(a: number, b: number): string {
  return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다. 백업 JSON 을 넣는다 (--dir= 로 다른 경로 지정 가능).`)
    process.exit(1)
  }
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))
  const seen = new Map<string, LearningEvent>()
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`${f} 가 이벤트 배열이 아니다. 건너뛴다.`)
      continue
    }
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }

  const p = plateauProfile([...seen.values()])
  if (!p) {
    console.error('읽기 채점 이벤트가 없다.')
    process.exit(1)
  }
  const { chronic: c, rest: r } = p.window
  const all = c.n + r.n
  console.log('=== 정체기 실측 ===')
  console.log(`표현 ${p.idioms}개, 오답 ${p.wrongTotal}건`)
  console.log(`상습 표현(누적 오답 ${CHRONIC_WRONG}회+) ${p.chronic}개 — 오답 ${p.chronicWrong}건 (${pct(p.chronicWrong, p.wrongTotal)})`)
  console.log(`  같은 오답을 두 번 이상 낸 표현 ${p.sameWrongRepeated}개`)
  console.log(`  맞힌 다음 만남에 다시 틀림 ${pct(p.relapse.wrongNext, p.relapse.afterCorrect)} (${p.relapse.afterCorrect}건)`)
  console.log('')
  console.log(`최근 ${WINDOW_DAYS}일 창 — 채점 ${all}, 정답률 ${pct(c.ok + r.ok, all)}`)
  console.log(`  상습 표현 ${c.n}건 (${pct(c.n, all)}) 정답률 ${pct(c.ok, c.n)}`)
  console.log(`  나머지 ${r.n}건 정답률 ${pct(r.ok, r.n)}`)
}

if (import.meta.filename === process.argv[1]) main()
