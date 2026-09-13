// Drive 동기화 파일을 사람이 읽을 수 있게 훑는다 — 실제 동기화에 무슨 일이 있었는지 본다.
//
// 앱은 동기화 로그를 남기지 않는다. 남은 증거는 Drive 의 `reviews-*.json` 뿐이라,
// 그 파일들을 직접 읽어 기기별 건수·기간·빈 파일 여부를 센다.
//
// 특히 **빈 파일과 기기 불일치**를 본다 — 로컬이 빈 채로 올라가 Drive 사본을 덮어쓴
// 흔적이다 (2026-09-13 에 고친 유실 버그, context-notes 참조).
//
// 2026-09-13 개편 후 폴더에는 backup.json 하나만 있는 게 정상이다. 전송 파일(sync-*.json)이
// 남아 있으면 그 기기의 동기화가 백업 쓰기 전에 끊긴 것이다.
//
// 입력 — data/events/*.json (Drive 백업 폴더에서 그대로 내려받아 넣는다)
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { LearningEvent } from '../src/core/types.ts'

const EVENTS_DIR =
  process.argv.find((a) => a.startsWith('--dir='))?.split('=')[1] ??
  join(import.meta.dirname, '..', 'data', 'events')

if (!existsSync(EVENTS_DIR)) {
  console.error(`${EVENTS_DIR} 가 없다.`)
  console.error('Drive 의 YomenaiSync 폴더에서 reviews-*.json 을 통째로 내려받아 넣는다.')
  process.exit(1)
}

const files = readdirSync(EVENTS_DIR).filter((f) => f.endsWith('.json'))
if (files.length === 0) {
  console.error(`${EVENTS_DIR} 에 .json 이 없다.`)
  process.exit(1)
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

interface FileStat {
  name: string
  events: number
  devices: Map<string, number>
  first: number
  last: number
  bad: number
}

/** 파일 이름이 말하는 역할. 지워도 되는 것과 아닌 것을 가른다 */
function role(name: string): string {
  if (name === 'backup.json') return '백업 — 지우면 안 되는 것'
  if (name === 'reviews-archive.json') return '옛 보관 파일 — 다음 동기화에 백업으로 접힘'
  if (name.startsWith('sync-')) return '전송 — 백업에 접히면 지워짐'
  if (name.startsWith('reviews-')) return '옛 기기 파일 — 다음 동기화에 백업으로 접힘'
  return '알 수 없는 파일'
}

const stats: FileStat[] = []
const allIds = new Set<string>()
let duplicated = 0

for (const f of files.sort()) {
  const parsed = JSON.parse(readFileSync(join(EVENTS_DIR, f), 'utf8')) as unknown
  if (!Array.isArray(parsed)) {
    console.error(`⚠ ${f} 가 이벤트 배열이 아니다 — 건너뜀`)
    continue
  }
  const events = parsed as LearningEvent[]
  const devices = new Map<string, number>()
  let first = Infinity
  let last = -Infinity
  let bad = 0
  for (const e of events) {
    if (typeof e?.id !== 'string' || typeof e?.at !== 'number') {
      bad++
      continue
    }
    devices.set(e.deviceId, (devices.get(e.deviceId) ?? 0) + 1)
    first = Math.min(first, e.at)
    last = Math.max(last, e.at)
    if (allIds.has(e.id)) duplicated++
    else allIds.add(e.id)
  }
  stats.push({ name: f, events: events.length, devices, first, last, bad })
}

console.log('=== Drive 동기화 파일 점검 ===\n')
for (const s of stats) {
  const range = s.events > 0 ? `${day(s.first)} ~ ${day(s.last)}` : '—'
  console.log(`${s.name}  [${role(s.name)}]`)
  console.log(`  이벤트 ${s.events}건 · ${range}${s.bad ? ` · 깨진 행 ${s.bad}` : ''}`)
  if (s.devices.size === 0) {
    console.log('  ⚠ 비어 있다 — 로컬이 빈 채로 올라가 덮어쓴 흔적일 수 있다')
  } else {
    const own = s.name.replace(/^reviews-|\.json$/g, '')
    for (const [dev, n] of [...s.devices].sort((a, b) => b[1] - a[1])) {
      const mark = s.name === 'reviews-archive.json' || dev === own ? '' : '  ← 파일 이름과 다른 기기'
      console.log(`  ${dev}: ${n}건${mark}`)
    }
  }
  console.log()
}

const total = allIds.size
const empty = stats.filter((s) => s.events === 0)
console.log('─'.repeat(40))
console.log(`파일 ${stats.length}개 · 고유 이벤트 ${total}건 (파일 간 중복 ${duplicated}건은 한 번만 셈)`)
if (empty.length > 0) {
  console.log(`\n⚠ 빈 파일 ${empty.length}개 — ${empty.map((s) => s.name).join(', ')}`)
  console.log('  기기를 새로 열고 학습 전에 동기화만 눌러도 생긴다. 기록이 있던 기기의 파일이')
  console.log('  비어 있다면 2026-09-13 에 고친 덮어쓰기 유실에 당한 것이다.')
}

const hasBackup = stats.some((s) => s.name === 'backup.json')
const leftovers = stats.filter((s) => s.name !== 'backup.json')
console.log('')
if (!hasBackup) {
  console.log('⚠ backup.json 이 없다 — 2026-09-13 이후 동기화를 아직 한 번도 안 돌렸다.')
} else if (leftovers.length > 0) {
  console.log(`남은 파일 ${leftovers.length}개는 다음 동기화에서 backup.json 으로 접힌다.`)
} else {
  console.log('정상 — backup.json 하나뿐이다.')
}
