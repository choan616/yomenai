// 숙어를 (한자, 음독) 쌍으로 분해해 data/dict/onyomi-map.json 을 만들고 매핑 실패를 보고하는 빌드 스크립트
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { bandOf, type Band } from '../src/lib/bands.ts'
import { decompose, pairId, type FailReason, type KanjiReadings } from '../src/lib/onyomi.ts'
import { surfaceCandidates } from '../src/lib/readings.ts'

/** 저장용 압축 세그먼트 — [한자, 표면형, 원형, 음훈, 변형] */
export type PackedSegment = [string, string, string, 'on' | 'kun', string[]]

export interface PairRecord {
  kanji: string
  base: string
  kind: 'on' | 'kun'
  /** 이 쌍이 등장하는 숙어 수 */
  count: number
  /** 밴드 0~3 안에서의 등장 수 — 진단 우선순위 산정용 */
  countLearnable: number
}

export interface MapStats {
  total: number
  ok: number
  failed: number
  byReason: Record<FailReason, number>
  /** 밴드별 실패 수 / 전체 수 */
  byBand: Record<string, { total: number; ok: number; failed: number }>
  pairCount: number
  mixedCount: number
}

export function buildMap(idioms: IdiomRecord[], kanji: Record<string, KanjiReadings>) {
  const lookup = (k: string) => kanji[k]
  const byIdiom: Record<string, PackedSegment[]> = {}
  const pairs = new Map<string, PairRecord>()
  const failures: { id: string; headword: string; reading: string; band: Band; reason: FailReason }[] = []

  const stats: MapStats = {
    total: idioms.length,
    ok: 0,
    failed: 0,
    byReason: { KATAKANA_READING: 0, UNKNOWN_KANJI: 0, NO_PARSE: 0, BUDGET: 0 },
    byBand: {},
    pairCount: 0,
    mixedCount: 0,
  }
  for (const b of ['0', '1', '2', '3', '4']) stats.byBand[b] = { total: 0, ok: 0, failed: 0 }

  for (const it of idioms) {
    const band = bandOf(it)
    const bs = stats.byBand[String(band)]
    bs.total++
    const d = decompose(it.headword, it.reading, lookup)
    if (!d.ok) {
      stats.failed++
      bs.failed++
      stats.byReason[d.reason]++
      failures.push({ id: it.id, headword: it.headword, reading: it.reading, band, reason: d.reason })
      continue
    }
    stats.ok++
    bs.ok++
    if (d.mixed) stats.mixedCount++
    byIdiom[it.id] = d.segments.map((s) => [s.kanji, s.surface, s.base, s.kind, s.variants] as PackedSegment)
    for (const s of d.segments) {
      const pid = pairId(s.kanji, s.base, s.kind)
      let rec = pairs.get(pid)
      if (!rec) {
        rec = { kanji: s.kanji, base: s.base, kind: s.kind, count: 0, countLearnable: 0 }
        pairs.set(pid, rec)
      }
      rec.count++
      if (band <= 3) rec.countLearnable++
    }
  }
  stats.pairCount = pairs.size
  return { byIdiom, pairs, failures, stats }
}

/**
 * 음독 그래프의 순환 참조를 검사한다.
 * 그래프는 이분 그래프다 — 숙어 노드는 자신을 구성하는 (한자, 음독) 쌍 노드로만 나가는 간선을 갖고,
 * 쌍 노드는 나가는 간선이 없다. 위상 정렬이 전체 노드를 소진하면 순환이 없다.
 */
export function findCycles(byIdiom: Record<string, PackedSegment[]>): string[][] {
  const outdeg = new Map<string, number>()
  const incoming = new Map<string, string[]>() // 노드 → 그 노드로 향하는 간선의 출발점들
  const node = (s: string) => {
    if (!outdeg.has(s)) outdeg.set(s, 0)
    if (!incoming.has(s)) incoming.set(s, [])
  }
  for (const [id, segs] of Object.entries(byIdiom)) {
    const from = `idiom:${id}`
    node(from)
    const targets = new Set(segs.map((s) => pairId(s[0], s[2], s[3])))
    for (const t of targets) {
      node(t)
      outdeg.set(from, outdeg.get(from)! + 1)
      incoming.get(t)!.push(from)
    }
  }
  // 나가는 간선이 없는 노드부터 제거해 나간다 (역방향 Kahn)
  const queue = [...outdeg].filter(([, d]) => d === 0).map(([n]) => n)
  const removed = new Set<string>()
  while (queue.length > 0) {
    const n = queue.pop()!
    if (removed.has(n)) continue
    removed.add(n)
    for (const src of incoming.get(n) ?? []) {
      const d = outdeg.get(src)! - 1
      outdeg.set(src, d)
      if (d === 0) queue.push(src)
    }
  }
  const stuck = [...outdeg.keys()].filter((n) => !removed.has(n))
  return stuck.length === 0 ? [] : [stuck]
}

function main() {
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as { idioms: IdiomRecord[] }
  const { kanji } = JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
    kanji: Record<string, KanjiReadings>
  }

  const { byIdiom, pairs, failures, stats } = buildMap(idioms, kanji)

  const cycles = findCycles(byIdiom)
  if (cycles.length > 0) throw new Error(`음독 그래프에 순환 참조 ${cycles[0].length}개 노드: ${cycles[0].slice(0, 5)}`)

  const varCycle = findVariantCycles([...pairs.values()].map((p) => p.base))
  if (varCycle.length > 0) throw new Error(`변형 파생 그래프에 순환: ${varCycle.join(" -> ")}`)

  const out = {
    _meta: {
      source: 'JMdict_e + KANJIDIC2 (EDRDG)',
      rule: '連濁·促音便·半濁音·連声 변형 후보 생성 후 최소 비용 분해',
      generatedAt: new Date().toISOString(),
      acyclic: true,
    },
    stats,
    pairs: Object.fromEntries([...pairs].map(([k, v]) => [k, v])),
    byIdiom,
  }
  const outPath = join(DICT_DIR, 'onyomi-map.json')
  writeFileSync(outPath, JSON.stringify(out))

  // 실패 목록은 검수 대상이므로 사람이 읽을 수 있는 형태로 따로 낸다
  const failPath = join(DICT_DIR, 'onyomi-failures.tsv')
  writeFileSync(
    failPath,
    'band\treason\theadword\treading\tid\n' +
      failures
        .sort((a, b) => a.band - b.band || a.reason.localeCompare(b.reason))
        .map((f) => `${f.band}\t${f.reason}\t${f.headword}\t${f.reading}\t${f.id}`)
        .join('\n') + '\n',
  )

  const pct = (n: number, d: number) => ((n / d) * 100).toFixed(2) + '%'
  console.log(`=== 음독 매핑 (총 ${stats.total}) ===`)
  console.log(`  성공 ${stats.ok} (${pct(stats.ok, stats.total)})  실패 ${stats.failed} (${pct(stats.failed, stats.total)})`)
  console.log(`  음훈 혼독(重箱·湯桶) ${stats.mixedCount} (${pct(stats.mixedCount, stats.ok)})`)
  console.log(`  고유 (한자, 읽기) 쌍 ${stats.pairCount}\n`)
  console.log('  실패 사유별:')
  for (const [r, n] of Object.entries(stats.byReason)) if (n > 0) console.log(`    ${r}: ${n}`)
  console.log('\n  밴드별 실패율:')
  for (const b of ['0', '1', '2', '3', '4']) {
    const s = stats.byBand[b]
    console.log(`    밴드 ${b}: ${s.failed} / ${s.total} (${pct(s.failed, s.total)})`)
  }
  console.log('\n  순환 참조 검사:')
  console.log('    숙어 → (한자, 읽기) 이분 그래프: 없음 (위상 정렬로 전체 노드 소진)')
  console.log('    변형 파생 그래프(連濁·促音便·半濁·連声): 없음 (색칠 DFS)')
  console.log(`\n  → ${outPath}`)
  console.log(`  → ${failPath}`)
}

if (import.meta.filename === process.argv[1]) main()

/**
 * 변형 파생 그래프의 순환을 검사한다.
 * 노드는 가나 문자열, 간선은 (원형 → 변형형) 이다. 連濁·促音便·半濁·連声 규칙이
 * 서로를 되먹이면 후보 생성이 발산하므로 이쪽이 실제 순환 위험이 있는 그래프다.
 */
export function findVariantCycles(baseTexts: Iterable<string>): string[] {
  const edges = new Map<string, Set<string>>()
  const queue: string[] = []
  const push = (t: string) => {
    if (edges.has(t)) return
    edges.set(t, new Set())
    queue.push(t)
  }
  for (const t of baseTexts) push(t)

  // 어두 / 일반 비어두 / っ 뒤 / ん 뒤 — 규칙이 적용될 수 있는 모든 선행 문맥
  const CONTEXTS = ['', 'あ', 'っ', 'ん']
  while (queue.length > 0) {
    const t = queue.pop()!
    for (const ctx of CONTEXTS) {
      for (const cand of surfaceCandidates([{ text: t, kind: 'kun', cost: 0, prefix: true }], ctx, false)) {
        if (cand.text === t) continue
        edges.get(t)!.add(cand.text)
        push(cand.text)
      }
    }
  }

  // 색칠 DFS — 회색 노드를 다시 만나면 순환이다
  const color = new Map<string, 0 | 1 | 2>()
  const stack: string[] = []
  const visit = (n: string): string[] | null => {
    if (color.get(n) === 2) return null
    if (color.get(n) === 1) return [...stack.slice(stack.indexOf(n)), n]
    color.set(n, 1)
    stack.push(n)
    for (const m of edges.get(n) ?? []) {
      const cyc = visit(m)
      if (cyc) return cyc
    }
    stack.pop()
    color.set(n, 2)
    return null
  }
  for (const n of edges.keys()) {
    const cyc = visit(n)
    if (cyc) return cyc
  }
  return []
}
