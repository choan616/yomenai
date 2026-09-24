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
// 입력 — data/events/*.json (Drive 의 YomenaiSync 파일을 그대로 내려받아 넣는다)
// 출력 — data/dict/korean-meaning-worklist*.tsv 의 verdict·fix 칸
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--events='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')
const DRY = process.argv.includes('--dry')

interface Vote {
  verdict: 'ok' | 'bad' | null
  fix?: string
  headword: string
  at: number
}

/** 마지막 판정이 이긴다 — `replay` 와 같은 규칙. 취소(`null`)도 마지막이면 이긴다 */
function foldVotes(): Map<string, Vote> {
  const out = new Map<string, Vote>()
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

const votes = foldVotes()
if (votes.size === 0) {
  console.error(`${EVENTS_DIR} 에서 뜻 판정을 못 찾았다.`)
  console.error('Drive 의 YomenaiSync 폴더에서 동기화 파일을 내려받아 넣는다 (--events= 로 경로 지정).')
  process.exit(1)
}

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
    if (v.verdict === null) {
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

    const mark = v.verdict === 'ok' ? 'o' : v.fix ? 'x' : '~'
    r[col.verdict] = mark
    if (v.fix) r[col.fix] = v.fix
    tally[mark]++
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
  console.log('  (build:korean-meaning-worklist 를 --events= 와 같이 돌리면 담은 것이 실린다)')
}
if (!DRY) console.log('  → 이어서 apply:korean-meaning 을 돌린다')
