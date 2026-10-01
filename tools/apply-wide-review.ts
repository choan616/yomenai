// 앱에서 남긴 뜻 검수 판정 중 **사전 밖(넓힌 사전) 표현**의 것을 덮어쓰기 기록에 채운다 (2026-10-01)
//
// 「사전 밖에서 담은 표현도 뜻 검수가 되게」에서 나온 도구다. 앱의 뜻 검수가 사전 밖 표현을
// 보여 주기 시작했지만, 그 판정이 사전에 닿는 길은 `apply-app-review` → `korean-class.json`
// 뿐이었고 거기는 넓힌 사전 id 를 모른다(「작업 파일에 없는 판정」으로 흘려보냈다).
//
// **넓힌 사전 항목을 `korean-class.json` 에 넣지 않는다.** 15,114개가 학습 사전의 분류·밴드·
// 진단 기준에 섞인다(context-notes 2026-09-25). 판정은 `data/dict/korean-meaning-wide-overrides.json`
// 에 쌓이고, `build-wide-dict.ts` 가 번역 초안 위에 얹어 `public/dict/wide.json` 을 만든다.
//
// 입력 — data/dict/korean-meaning-app-review.tsv (앱의 「판정 내보내기」 · `apply-app-review` 와 같은 파일)
// 규칙은 `tools/lib/wide-review.ts` 머리말 — 기본은 이미 기록된 항목을 안 덮고, `--force` 면
// 값이 다른 것만 덮는다. 자동으로는 안 켠다(CLI 에 직접 치는 플래그가 곧 확인이다).
//   --dry     쓰지 않고 집계만 본다
//   --export= 내보내기 파일 경로
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv } from './lib/tsv.ts'
import { foldWideReview, type ExportRow, type WideReview } from './lib/wide-review.ts'

const EXPORT_PATH =
  process.argv.find((a) => a.startsWith('--export='))?.split('=')[1] ??
  join(DICT_DIR, 'korean-meaning-app-review.tsv')
const REVIEW_PATH = join(DICT_DIR, 'korean-meaning-wide-overrides.json')
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')

if (!existsSync(EXPORT_PATH)) {
  console.error(`${EXPORT_PATH} 가 없다. 앱의 뜻 검수 화면에서 「판정 내보내기」로 받은 파일이 필요하다.`)
  process.exit(1)
}
const need = (p: string) => {
  if (!existsSync(p)) {
    console.error(`${p} 가 없다.`)
    process.exit(1)
  }
  return p
}

const grid = readTsv(EXPORT_PATH)
const head = (grid[0] ?? []).map((h) => h.replace(/^﻿/, '').trim())
const col = { id: head.indexOf('id'), v: head.indexOf('verdict'), fix: head.indexOf('fix') }
if (col.id < 0 || col.v < 0) {
  console.error(`${EXPORT_PATH} 에 id/verdict 칸이 없다.`)
  process.exit(1)
}
const rows: ExportRow[] = grid
  .slice(1)
  .map((r) => ({
    id: (r[col.id] ?? '').trim(),
    verdict: (r[col.v] ?? '').trim(),
    fix: (col.fix >= 0 ? (r[col.fix] ?? '') : '').trim(),
  }))
  .filter((r) => r.id !== '')

const draft = new Map(
  Object.entries(
    (
      JSON.parse(readFileSync(need(join(DICT_DIR, 'korean-meaning-wide.json')), 'utf8')) as {
        byId: Record<string, { ko: string }>
      }
    ).byId,
  ).map(([id, v]) => [id, v.ko]),
)
const classIds = new Set(
  Object.keys(
    (JSON.parse(readFileSync(need(join(DICT_DIR, 'korean-class.json')), 'utf8')) as { byId: Record<string, unknown> })
      .byId,
  ),
)
const prev: WideReview = existsSync(REVIEW_PATH)
  ? (JSON.parse(readFileSync(REVIEW_PATH, 'utf8')) as { byId: WideReview }).byId
  : {}

const { next, stats } = foldWideReview(rows, draft, classIds, prev, FORCE)

console.log(`앱 내보내기 ${rows.length}건을 읽었다 (${EXPORT_PATH})`)
console.log('\n=== 사전 밖 표현 검수 반영 ===')
console.log(
  `  새로 ${stats.added} · 이미 있어 유지 ${stats.kept} · 덮어씀 ${stats.overwritten} · 안 건드림 ${stats.untouched}` +
    ` · 학습 사전 id ${stats.classOwned} · 어디에도 없음 ${stats.unknown}`,
)
for (const c of stats.changes) console.log(`  덮어씀 ${c.id}  ${c.from} → ${c.to}`)
if (stats.kept > 0 && !FORCE) {
  console.log('  (이미 기록된 항목은 안 덮었다. 앱 판정이 최신이면 --force)')
}

if (DRY) {
  console.log('\n--dry 라 쓰지 않았다.')
  process.exit(0)
}
const changed = stats.added + stats.overwritten > 0
if (changed) {
  // id 순으로 정렬해 쓴다 — 저장소에 커밋되는 파일이라 diff 가 안정적이어야 한다
  const sorted = Object.fromEntries(Object.entries(next).sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(
    REVIEW_PATH,
    JSON.stringify(
      {
        _meta: {
          note: '사전 밖(넓힌 사전) 표현의 뜻 검수 결과. build-wide-dict.ts 가 번역 초안 위에 얹는다',
          count: Object.keys(sorted).length,
        },
        byId: sorted,
      },
      null,
      1,
    ) + '\n',
  )
  console.log(`\n→ ${REVIEW_PATH}  (${Object.keys(sorted).length}건)`)
  console.log('  → 이어서 build:wide-dict 를 돌린다')
} else {
  console.log('\n바뀐 것이 없다.')
}
