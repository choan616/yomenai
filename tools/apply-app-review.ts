// 앱에서 남긴 뜻 검수 판정을 검수 TSV 에 채워 넣는다 (2026-09-24, 원격 검수).
//
// 「물리적으로 로컬에서만 검수를 하는게 쉽지는 않다」는 지적에서 나온 도구다. 앱의 검수
// 화면(설정 → 뜻 검수)에서 찍은 판정이 `flag` 이벤트로 남고 Drive 로 나가는데, 그게
// 사전까지 오려면 이 한 칸이 있어야 한다.
//
// **방향은 이벤트 → 검수 TSV 한 쪽뿐이다.** `korean-class.json` 을 직접 안 고친다 —
// `build-event-worklist` 머리말이 세워 둔 원칙 그대로다. 사람이 한 번 보고
// `apply:korean-meaning` 을 돌려야 사전에 닿는다.
//
// 판정은 워크리스트와 1:1 이다.
//   verdict 'ok'            → o
//   verdict 'bad' + fix     → x (fix 칸에 고친 정의)
//   verdict 'bad'  (fix 없음) → ~ (애매. 사람이 다시 본다)
//   verdict null            → 취소. 이 도구는 **안 건드린다** — 이미 찍힌 사람 판정을
//                             앱의 취소가 지우면 안 된다
//
// 입력은 둘이고, **앞의 것이 원본이다.**
//   1. data/dict/korean-meaning-app-review.tsv — 앱의 「판정 내보내기」가 낸 파일.
//      판정 네 칸뿐이라 저장소에 커밋된다 (`.gitignore` 의 `*-review.tsv` 예외).
//      검수 TSV 와 같은 자격으로 추적되는 것이 요점이다 — `src/core/reviewExport.ts` 머리말
//   2. data/events/*.json — Drive 동기화 파일 통째. 학습 기록이 섞여 있어 커밋을 못 한다.
//      내보내기가 생기기 전의 경로이고, 지금도 읽히기는 한다
// 출력 — data/dict/korean-meaning-worklist*.tsv 의 verdict·fix 칸
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--events='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')
const EXPORT_PATH =
  process.argv.find((a) => a.startsWith('--export='))?.split('=')[1] ??
  join(DICT_DIR, 'korean-meaning-app-review.tsv')
const DRY = process.argv.includes('--dry')

type Mark = 'o' | 'x' | '~'
interface Vote {
  /** 검수 TSV 의 판정 글자. `null` 은 취소 — 봤다는 표시일 뿐 판정이 아니다 */
  mark: Mark | null
  fix?: string
  headword: string
}
/** 동기화 파일에서 접은 것. 어휘가 아직 이벤트 쪽(`ok`/`bad`)이고 `at` 으로 마지막을 가린다 */
interface EventVote {
  verdict: 'ok' | 'bad' | null
  fix?: string
  headword: string
  at: number
}

/** 마지막 판정이 이긴다 — `replay` 와 같은 규칙. 취소(`null`)도 마지막이면 이긴다 */
function foldVotes(): Map<string, EventVote> {
  const out = new Map<string, EventVote>()
  if (!existsSync(EVENTS_DIR)) return out
  for (const f of readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))) {
    let parsed: unknown
    try {
      parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8'))
    } catch {
      console.error(`  ! ${f} 를 못 읽었다 — 건너뛴다`)
      continue
    }
    const events = (parsed as { events?: unknown[] }).events ?? (parsed as unknown[])
    if (!Array.isArray(events)) continue
    for (const e of events as {
      type?: string
      idiomId?: string
      verdict?: 'ok' | 'bad' | null
      on?: boolean
      fix?: string
      headword?: string
      at?: number
      deletedAt?: unknown
    }[]) {
      if (e.type !== 'flag' || e.deletedAt != null || !e.idiomId) continue
      // 첫 배포분 호환 — 그때는 「이상해요」뿐이라 boolean 이었다
      const verdict = e.verdict ?? (e.on === true ? 'bad' : null)
      const at = e.at ?? 0
      const prev = out.get(e.idiomId)
      if (prev !== undefined && prev.at > at) continue
      out.set(e.idiomId, {
        verdict,
        ...(e.fix ? { fix: e.fix } : {}),
        headword: e.headword ?? '',
        at,
      })
    }
  }
  return out
}

/** 이벤트 어휘를 검수 TSV 어휘로 옮긴다. 앱 내보내기는 이미 옮겨진 채로 온다 */
function markOf(v: { verdict: 'ok' | 'bad' | null; fix?: string }): Mark | null {
  return v.verdict === null ? null : v.verdict === 'ok' ? 'o' : v.fix ? 'x' : '~'
}

/**
 * 앱이 내보낸 판정 파일. `id·headword·verdict·fix` 네 칸이고 판정 글자가 이미 TSV 어휘다
 * (`o` `x` `~` `-`). `-` 는 취소라 여기서 `null` 이 된다
 */
function fromExport(): Map<string, Vote> {
  const out = new Map<string, Vote>()
  if (!existsSync(EXPORT_PATH)) return out
  const rows = readTsv(EXPORT_PATH)
  const head = (rows[0] ?? []).map((h) => h.replace(/^﻿/, '').trim())
  const col = { id: head.indexOf('id'), head: head.indexOf('headword'), v: head.indexOf('verdict'), fix: head.indexOf('fix') }
  if (col.id < 0 || col.v < 0) {
    console.error(`  ! ${EXPORT_PATH} 에 id/verdict 칸이 없다 — 건너뛴다`)
    return out
  }
  for (const r of rows.slice(1)) {
    const id = r[col.id]?.trim()
    if (!id) continue
    const raw = (r[col.v] ?? '').trim()
    const fix = (col.fix >= 0 ? (r[col.fix] ?? '') : '').trim()
    out.set(id, {
      mark: raw === 'o' || raw === 'x' || raw === '~' ? raw : null,
      ...(fix ? { fix } : {}),
      headword: (col.head >= 0 ? (r[col.head] ?? '') : '').trim(),
    })
  }
  return out
}

// 둘 다 있으면 **내보낸 파일이 이긴다.** 그쪽이 저장소에 남아 되짚을 수 있는 원본이다
const exported = fromExport()
const votes = new Map<string, Vote>([
  ...[...foldVotes()].map(([id, v]): [string, Vote] => [
    id,
    { mark: markOf(v), ...(v.fix ? { fix: v.fix } : {}), headword: v.headword },
  ]),
  ...exported,
])
if (votes.size === 0) {
  console.error('뜻 판정을 못 찾았다. 둘 중 하나가 있어야 한다.')
  console.error(`  ${EXPORT_PATH} — 앱의 뜻 검수 화면에서 「판정 내보내기」로 받은 파일`)
  console.error(`  ${EVENTS_DIR}/*.json — Drive 의 YomenaiSync 동기화 파일`)
  process.exit(1)
}
if (exported.size > 0) console.log(`앱 내보내기 ${exported.size}건을 읽었다 (${EXPORT_PATH})`)

const files = readdirSync(DICT_DIR).filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f))
if (files.length === 0) {
  console.error('korean-meaning-worklist*.tsv 가 없다. build:korean-meaning-worklist 를 먼저 돌린다.')
  process.exit(1)
}

const tally = { o: 0, x: 0, '~': 0, skipCancel: 0, kept: 0, notInList: new Set<string>() }
const touched = new Set(votes.keys())

for (const file of files) {
  const rows = readTsv(join(DICT_DIR, file))
  if (rows.length === 0) continue
  const head = rows[0]!.map((h) => h.replace(/^﻿/, ''))
  const col = {
    verdict: head.indexOf('verdict'),
    fix: head.indexOf('fix'),
    id: head.indexOf('id'),
  }
  if (col.verdict < 0 || col.fix < 0 || col.id < 0) {
    console.error(`  ! ${file} 에 verdict/fix/id 칸이 없다 — 건너뛴다`)
    continue
  }

  let changed = 0
  for (const r of rows.slice(1)) {
    const id = r[col.id]
    if (!id) continue
    const v = votes.get(id)
    if (v === undefined) continue
    touched.delete(id)

    // 취소는 안 건드린다. 앱에서 엄지를 껐다고 사람이 찍은 판정을 지울 이유가 없다
    if (v.mark === null) {
      tally.skipCancel++
      continue
    }
    // **이미 사람이 찍은 칸은 덮지 않는다.** 앱 판정은 초벌이고 TSV 가 최종이다.
    // `?` 는 워크리스트의 「미기입」 표시라 빈 칸으로 본다
    const already = (r[col.verdict] ?? '').trim()
    if (already !== '' && already !== '?') {
      tally.kept++
      continue
    }

    r[col.verdict] = v.mark
    if (v.fix) r[col.fix] = v.fix
    tally[v.mark]++
    changed++
  }

  if (changed > 0 && !DRY) {
    writeTsvBom(join(DICT_DIR, file), rows.map((r) => r.join('\t')).join('\n'))
  }
  if (changed > 0) console.log(`  ${file} — ${changed}행${DRY ? ' (dry)' : ''}`)
}

for (const id of touched) tally.notInList.add(`${votes.get(id)?.headword ?? ''}(${id})`)

console.log('\n=== 앱 검수 반영 ===')
console.log(
  `  o ${tally.o} · x ${tally.x} · ~ ${tally['~']} · 취소 건너뜀 ${tally.skipCancel} · 이미 찍힌 칸 유지 ${tally.kept}`,
)
if (tally.notInList.size > 0) {
  console.log(
    `  작업 파일에 없는 판정 ${tally.notInList.size}개 — ${[...tally.notInList].slice(0, 8).join(' ')}`,
  )
  console.log('  (build:korean-meaning-worklist 를 먼저 돌리면 내보낸 판정·담은 것이 실린다)')
}
if (!DRY) console.log('  → 이어서 apply:korean-meaning 을 돌린다')
