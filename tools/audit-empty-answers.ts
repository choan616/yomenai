// 빈 답 오답이 얼마나 쌓였는지 센다 (checklist P2).
//
// 2026-09-06 12:39(`9b432cb`) 전까지 `KanaInput` 이 빈 값도 제출했다. 다음 문제로 넘어가면
// 입력창이 auto-focus 되는데 "입력→Enter" 리듬으로 빠르게 치면 새 문제를 읽기 전에 Enter 가
// 눌려 빈 답('')이 오답으로 채점됐다. 그 이벤트가 지금도 로그에 남아 오답 유형 분포·취약
// 음독·밴드 추정·FSRS 를 오염시킨다.
//
// **세기만 한다. 아무것도 안 지운다.** 규모를 알아야 지울 값어치가 있는지 정한다.
//
// 서명 — `type:'review'` + `cardType:'reading'` + `answer:''` + `correct:false`.
// 뜻 카드는 `answer` 가 늘 빈 문자열이라(자기 채점) 반드시 읽기 카드로 좁혀야 한다.
//
// 입력 — data/events/*.json (Drive 의 backup.json 을 내려받아 넣는다)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LearningEvent, ReviewEvent } from '../src/core/types.ts'

/** 빈 답 제출을 막은 커밋 `9b432cb` 의 시각 */
const FIX_AT = Date.parse('2026-09-06T12:39:35+09:00')

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

if (!existsSync(EVENTS_DIR)) {
  console.error(`${EVENTS_DIR} 가 없다.`)
  console.error('Drive 의 YomenaiSync 폴더에서 backup.json 을 내려받아 넣는다.')
  process.exit(1)
}

const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))
if (files.length === 0) {
  console.error(`${EVENTS_DIR} 에 .json 이 없다.`)
  process.exit(1)
}

// 파일이 여럿이면 id 로 합집합 — 같은 이벤트가 여러 파일에 있어도 한 번만 센다
const byId = new Map<string, LearningEvent>()
for (const f of files) {
  const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
  if (!Array.isArray(parsed)) {
    console.error(`⚠ ${f} 가 이벤트 배열이 아니다 — 건너뜀`)
    continue
  }
  for (const e of parsed as LearningEvent[]) {
    if (typeof e?.id === 'string') byId.set(e.id, e)
  }
}

const isReadingReview = (e: LearningEvent): e is ReviewEvent =>
  e.type === 'review' && e.cardType === 'reading' && e.deletedAt === null

const reading = [...byId.values()].filter(isReadingReview)
const wrong = reading.filter((e) => !e.correct)
const empty = wrong.filter((e) => e.answer === '')

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(1)}%`)

console.log('=== 빈 답 오답 점검 (P2) ===\n')
console.log(`파일 ${files.length}개 · 고유 이벤트 ${byId.size}건`)
console.log(`읽기 카드 채점 ${reading.length}건 · 그중 오답 ${wrong.length}건 (${pct(wrong.length, reading.length)})`)
console.log('')

if (empty.length === 0) {
  console.log('빈 답 오답 0건 — 지울 게 없다.')
  process.exit(0)
}

const before = empty.filter((e) => e.at < FIX_AT)
const after = empty.filter((e) => e.at >= FIX_AT)
const ats = empty.map((e) => e.at).sort((a, b) => a - b)
const idioms = new Set(empty.map((e) => e.idiomId))

console.log(`빈 답 오답 ${empty.length}건 · ${day(ats[0])} ~ ${day(ats[ats.length - 1])}`)
console.log(`  숙어 ${idioms.size}개에 걸쳐 있다`)
console.log(`  **전체 오답의 ${pct(empty.length, wrong.length)}** — 이만큼 정답률이 깎여 있다`)
console.log(`  수정(2026-09-06 12:39) 이전 ${before.length}건 / 이후 ${after.length}건`)
if (after.length > 0) {
  console.log('  ⚠ 수정 이후에도 생겼다면 다른 경로가 있다는 뜻이다 — 서명을 다시 봐야 한다')
}

// 날짜별 분포 — 어느 구간에 몰렸는지 본다
const perDay = new Map<string, number>()
for (const e of empty) perDay.set(day(e.at), (perDay.get(day(e.at)) ?? 0) + 1)
console.log('\n날짜별')
for (const [d, n] of [...perDay].sort()) {
  console.log(`  ${d}  ${String(n).padStart(4)}  ${'█'.repeat(Math.min(40, Math.ceil(n / 2)))}`)
}

// 이걸 빼면 정답률이 얼마나 올라가나 — 지울 값어치의 크기
const cleanWrong = wrong.length - empty.length
const cleanTotal = reading.length - empty.length
console.log('\n빼고 나면')
console.log(`  읽기 채점 ${cleanTotal}건 · 오답 ${cleanWrong}건 (${pct(cleanWrong, cleanTotal)})`)
console.log(
  `  정답률 ${pct(reading.length - wrong.length, reading.length)} → ${pct(cleanTotal - cleanWrong, cleanTotal)}`,
)
