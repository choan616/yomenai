// 응답 시간 축의 예측 타당도를 잰다 — "맞지만 느린" 항목이 다음 만남에 틀리는 비율이
// 빠른 정답보다 높은가 (2026-10-07, 교수자 관점 보완 A3).
//
// 수준 시트의 pace-line(`src/app/pace.ts`)이 전제하는 가정을 실측으로 검증하는 관문이다.
// 안 높으면 그 줄은 걷어낸다 — decisions.md 「처방 — 규칙 축에도 대조를 연다」 참조.
//
// 각 카드(숙어+읽기)의 정답 이벤트를 **느린 정답**(중앙값의 PACE_SLOW_FACTOR 배 이상)과
// **빠른 정답**으로 가르고, 그 각각의 바로 다음 같은 카드 이벤트가 오답인 비율을 나란히 낸다.
// 판단은 사람이 한다 — 이 스크립트는 숫자만 낸다.
//
// 입력 — data/events/*.json (Drive 동기화 파일 reviews-*.json 을 그대로 내려받아 넣는다).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { median, PACE_CAP_MS, PACE_SLOW_FACTOR } from '../src/core/pace.ts'
import { compareEvents, type LearningEvent, type ReviewEvent } from '../src/core/types.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

export interface PaceValidityBucket {
  /** 이 바구니(느린/빠른)의 정답 뒤 다음 이벤트가 있는 건수 */
  seen: number
  /** 그 다음 이벤트가 오답인 건수 */
  wrongNext: number
}

export interface PaceValidityResult {
  /** 정답 응답 시간 중앙값 (ms). pace-line 이 쓰는 것과 같은 자 */
  medianMs: number
  slow: PaceValidityBucket
  fast: PaceValidityBucket
}

/**
 * 읽기 카드의 정답 이벤트마다 **그 다음 같은 카드 이벤트**가 오답인지를 느린 정답·빠른
 * 정답으로 갈라 센다. 표본(중앙값 산정)이 없으면 null.
 *
 * `paceProfile` 과 다르게 **숙어당 최신 이벤트로 접지 않는다** — 여기서는 각 정답이
 * 그 시점에 다음에 무슨 일이 있었는지를 보는 것이라 과거 이벤트도 전부 살아 있어야 한다.
 */
export function pacePredictiveValidity(events: readonly LearningEvent[]): PaceValidityResult | null {
  const byIdiom = new Map<string, ReviewEvent[]>()
  for (const e of events) {
    if (e.type !== 'review' || e.deletedAt !== null || e.cardType !== 'reading') continue
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
  }
  for (const list of byIdiom.values()) list.sort(compareEvents)

  const correctMs: number[] = []
  for (const list of byIdiom.values()) {
    for (const e of list) {
      if (e.correct && e.elapsedMs > 0 && e.elapsedMs <= PACE_CAP_MS) correctMs.push(e.elapsedMs)
    }
  }
  if (correctMs.length === 0) return null
  const medianMs = median(correctMs)
  const threshold = medianMs * PACE_SLOW_FACTOR

  const slow: PaceValidityBucket = { seen: 0, wrongNext: 0 }
  const fast: PaceValidityBucket = { seen: 0, wrongNext: 0 }
  for (const list of byIdiom.values()) {
    for (let i = 0; i < list.length - 1; i++) {
      const e = list[i]!
      if (!e.correct || e.elapsedMs <= 0 || e.elapsedMs > PACE_CAP_MS) continue
      const bucket = e.elapsedMs >= threshold ? slow : fast
      bucket.seen++
      if (!list[i + 1]!.correct) bucket.wrongNext++
    }
  }
  return { medianMs, slow, fast }
}

function rate(b: PaceValidityBucket): string {
  return b.seen > 0 ? `${((b.wrongNext / b.seen) * 100).toFixed(1)}%` : '—'
}

function main(): void {
  if (!existsSync(EVENTS_DIR)) {
    console.error(`${EVENTS_DIR} 가 없다.`)
    console.error('Drive 백업 폴더의 reviews-*.json 을 내려받아 이 폴더에 넣는다 (--dir= 로 다른 경로 지정 가능).')
    process.exit(1)
  }
  const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))
  if (files.length === 0) {
    console.error(`${EVENTS_DIR} 에 .json 이 없다. Drive 의 reviews-*.json 을 넣는다.`)
    process.exit(1)
  }

  // 기기별 파일은 합집합이다 — 같은 이벤트 id 가 여러 파일에 있어도 한 번만 센다
  const seen = new Map<string, LearningEvent>()
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      console.error(`${f} 가 이벤트 배열이 아니다. 건너뛴다.`)
      continue
    }
    for (const e of parsed as LearningEvent[]) seen.set(e.id, e)
  }

  const result = pacePredictiveValidity([...seen.values()])
  if (!result) {
    console.error('정답 읽기 이벤트가 없다 — 중앙값을 낼 표본이 없다.')
    process.exit(1)
  }

  console.log('=== 응답 시간 예측 타당도 ===')
  console.log(`이벤트 파일 ${files.length}개`)
  console.log(`정답 응답 시간 중앙값 ${(result.medianMs / 1000).toFixed(1)}초 (느림 문턱 ${((result.medianMs * PACE_SLOW_FACTOR) / 1000).toFixed(1)}초)`)
  console.log('')
  console.log(`느린 정답 뒤 오답률 — ${rate(result.slow)} (표본 ${result.slow.seen}건, 오답 ${result.slow.wrongNext}건)`)
  console.log(`빠른 정답 뒤 오답률 — ${rate(result.fast)} (표본 ${result.fast.seen}건, 오답 ${result.fast.wrongNext}건)`)
  console.log('')
  console.log('판단은 사람이 한다 — 느린 쪽이 더 높아야 축이 산다 (docs/work-teaching-axis.md 3단계).')
}

if (import.meta.filename === process.argv[1]) main()
