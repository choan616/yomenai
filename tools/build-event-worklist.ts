// 앱에서 받은 지연 검수 응답(meaningKnown 이벤트)을 Phase 3 검수 TSV 로 되돌리는 도구 (checklist Phase 3 마지막 항목).
//
// 방향은 이벤트 로그 → 검수 TSV 한 쪽뿐이다. korean-class.json 을 직접 고치지 않는다 —
// "이 숙어, 뜻은 알고 있었어요?" 의 답은 *동형동의 여부의 강한 신호*지 사전 판정이 아니기
// 때문이다. 일본어를 따로 공부해서 아는 일본고유어도 「알았다」가 나온다.
// 사람이 verdict 칸을 채우면 apply:korean-review 가 korean-worklist*.tsv 를 다 읽어 반영한다.
//
// 입력 — data/events/*.json (Drive 동기화 파일 reviews-*.json 을 그대로 내려받아 넣는다).
// 출력 — data/dict/korean-worklist-events.tsv
//
// 담는 행은 **응답이 현재 분류와 어긋난 것만.** 일치하는 응답은 새 정보가 없어 집계로만 보고한다.
//   알았다   + 현재 분류 2·3  → 동형동의(1)일 수 있다
//   몰랐다   + 현재 분류 1     → 확장(2·3)일 수 있다
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { LearningEvent } from '../src/core/types.ts'
import { priorityToBand } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')
const OUT = join(DICT_DIR, 'korean-worklist-events.tsv')

interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: { definition: string; glossEn?: string[] } | null
}

/** 숙어 1개에 쌓인 응답을 접은 결과 */
export interface FoldedAnswer {
  idiomId: string
  /** 마지막 응답. 재생 순서(compareEvents)와 같은 기준으로 고른다 */
  known: boolean
  /** 응답 횟수. 진단과 지연 검수가 같은 이벤트를 쓰므로 2회 이상이 나온다 */
  count: number
  /** 응답이 시간에 따라 뒤집혔는지. 뒤집힌 건 사람이 더 신중히 본다 */
  flipped: boolean
  at: number
}

/**
 * meaningKnown 이벤트를 숙어별로 접는다. 삭제 묘비(deletedAt)는 버리고,
 * 같은 시각이면 id 로 갈라 기기 간 병합에도 결과가 흔들리지 않게 한다 (core/compareEvents 와 같은 규칙).
 */
export function foldMeaningKnown(events: LearningEvent[]): FoldedAnswer[] {
  const byIdiom = new Map<string, LearningEvent[]>()
  for (const e of events) {
    if (e.type !== 'meaningKnown' || e.deletedAt !== null) continue
    const list = byIdiom.get(e.idiomId)
    if (list) list.push(e)
    else byIdiom.set(e.idiomId, [e])
  }
  const out: FoldedAnswer[] = []
  for (const [idiomId, list] of byIdiom) {
    list.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const answers = list.map((e) => (e as Extract<LearningEvent, { type: 'meaningKnown' }>).known)
    const last = list[list.length - 1]
    out.push({
      idiomId,
      known: answers[answers.length - 1],
      count: answers.length,
      flipped: answers.some((k) => k !== answers[0]),
      at: last.at,
    })
  }
  return out
}

/** 응답이 현재 분류와 어긋나는가. 어긋난 것만 사람에게 보여 준다 */
export function contradicts(known: boolean, category: 1 | 2 | 3): boolean {
  return known ? category !== 1 : category === 1
}

/** 응답이 가리키는 분류. 「몰랐다」는 2·3 을 못 가르므로 잠정 분류를 그대로 물려준다 */
export function proposedCategory(known: boolean, tentative: 1 | 2 | 3): 1 | 2 | 3 {
  if (known) return 1
  return tentative === 1 ? 2 : tentative
}

// ── 여기부터 실행부 ──────────────────────────────────────────────────────────
// 직접 실행할 때만 돈다 — 테스트가 이 모듈을 임포트해도 파일을 쓰지 않게
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) main()

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
  const folded = foldMeaningKnown([...seen.values()])

  const { byId: classById } = JSON.parse(
    readFileSync(join(DICT_DIR, 'korean-class.json'), 'utf8'),
  ) as { byId: Record<string, KoClass> }
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const idiomById = new Map(idioms.map((i) => [i.id, i]))

  // 이미 사람이 채운 verdict 가 있는 숙어는 TSV 에서 뺀다.
  // apply:korean-review 는 korean-worklist*.tsv 를 파일명 순으로 읽어 뒤가 이기므로,
  // 같은 id 를 두 파일에 두면 어느 쪽이 반영됐는지 조용히 갈린다.
  const priorVerdict = new Map<string, { verdict: string; file: string }>()
  for (const f of readdirSync(DICT_DIR)) {
    if (!/^korean-worklist.*\.tsv$/.test(f) || f === 'korean-worklist-events.tsv') continue
    const rows = readTsv(join(DICT_DIR, f))
    const h = rows[0] ?? []
    const [vi, ii] = [h.indexOf('verdict'), h.indexOf('id')]
    if (vi < 0 || ii < 0) continue
    for (const c of rows.slice(1)) {
      const v = (c[vi] ?? '').trim()
      if (c[ii] && /^[123]$/.test(v)) priorVerdict.set(c[ii], { verdict: v, file: f })
    }
  }

  let agreed = 0
  let unknownIdiom = 0
  const held: { a: FoldedAnswer; prior: { verdict: string; file: string }; cat: 1 | 2 | 3 }[] = []
  const rows: string[][] = []
  for (const a of folded.sort((x, y) => y.at - x.at)) {
    const ko = classById[a.idiomId]
    const idiom = idiomById.get(a.idiomId)
    if (!ko || !idiom) {
      unknownIdiom++
      continue
    }
    if (!contradicts(a.known, ko.category)) {
      agreed++
      continue
    }
    const prior = priorVerdict.get(a.idiomId)
    if (prior) {
      held.push({ a, prior, cat: ko.category })
      continue
    }
    rows.push([
      '?', // 사람이 1/2/3 을 적는다
      String(proposedCategory(a.known, ko.category)),
      a.known ? '알았다' : '몰랐다',
      String(a.count),
      a.flipped ? 'y' : '',
      String(ko.category),
      ko.classSource,
      String(priorityToBand(idiom.priority)),
      idiom.headword,
      idiom.reading,
      ko.koMeaning?.definition ?? '',
      idiom.glossEn.join('; '),
      new Date(a.at).toISOString().slice(0, 10),
      a.idiomId,
    ])
  }

  const header = [
    'verdict', 'proposed', 'answer', 'answers', 'flip', 'now_cat', 'now_source',
    'band', 'headword', 'reading', 'ko_definition', 'glossEn', 'answered_at', 'id',
  ]
  writeTsvBom(OUT, [header, ...rows].map((r) => r.join('\t')).join('\n') + '\n')

  console.log('=== 지연 검수 응답 → 검수 TSV ===')
  console.log(`  이벤트 파일 ${files.length}개 / meaningKnown 숙어 ${folded.length}건`)
  console.log(`  현재 분류와 일치 ${agreed}건 (새 정보 없음, 파일에 안 담음)`)
  console.log(`  어긋남 ${rows.length}건 → ${OUT}`)
  if (unknownIdiom > 0) console.log(`  코퍼스 밖 숙어 ${unknownIdiom}건 무시`)
  if (held.length > 0) {
    console.log(`\n  ⚠ 이미 사람 verdict 가 있어 뺀 ${held.length}건 — 고치려면 원래 파일에서 고친다`)
    for (const { a, prior, cat } of held.slice(0, 20)) {
      const hw = idiomById.get(a.idiomId)?.headword ?? a.idiomId
      console.log(`     ${hw}  응답 ${a.known ? '알았다' : '몰랐다'} / 분류 ${cat} / verdict ${prior.verdict} (${prior.file})`)
    }
    if (held.length > 20) console.log(`     … 외 ${held.length - 20}건`)
  }
  if (rows.length > 0) {
    console.log('')
    console.log('  verdict 를 채운 뒤 `apply:korean-review -- --trust-llm` → `apply:korean-meaning` → `build:runtime-dict` 순으로 돌린다.')
    console.log('  apply:korean-review 가 koMeaning.verified 를 전부 false 로 되돌리므로 apply:korean-meaning 을 빼면 검수분이 날아간다.')
  }
}
