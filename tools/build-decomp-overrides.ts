// JmdictFurigana 를 근거로 decompose 의 熟字訓 과분할을 잡아 거부 목록을 만든다 (checklist Phase 12-C, 범위 변경).
//
// 12-B 실측 — decompose 경계 충돌은 0건. 남은 문제는 "우리가 JF 보다 잘게 자른" 562건인데,
// 그중 JF 가 한 덩어리로 묶은 다자 구간을 우리가 쪼갰고 **그 구간에 음운 변형(連濁·連声·促音·半濁)이
// 하나도 없으면** 우연한 사전 읽기 연접(= 熟字訓·当て字)이다. 天皇→てん|皇のう(連声) 같은
// 음운 파생 분해는 변형 태그가 있어 살아남고, 部屋→べ|や 나 如雨露(当て字)는 거부된다.
//
// 산출물 `data/dict/decomp-overrides.json` 은 커밋한다 — data/raw 의 JF 없이도(CI) build:onyomi 가
// 재현되게, 그리고 무엇을 왜 거부했는지 추적되게. 규칙을 손보면 `--validate` 로 드리프트를 본다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf } from '../src/lib/bands.ts'
import { decompose, type KanjiReadings } from '../src/lib/onyomi.ts'
import { DICT_DIR, RAW_DIR, componentKanji, type IdiomRecord } from './lib/dict.ts'

interface FuriEntry {
  ruby: string
  rt?: string
}
interface FuriRecord {
  text: string
  reading: string
  furigana: FuriEntry[]
}

export interface DecompOverride {
  action: 'reject'
  reason: 'JUKUJIKUN'
  jf: string
  our: string
  band: number
}
interface OverrideFile {
  _meta: { source: string; rule: string; generatedAt: string; count: number }
  overrides: Record<string, DecompOverride>
}

const OVERRIDE_PATH = join(DICT_DIR, 'decomp-overrides.json')
const FURI_PATH = join(RAW_DIR, 'JmdictFurigana.json')

/** JF furigana 를 headword 문자 인덱스 → 그 문자가 속한 그룹 크기로 편다 */
function jfGroupSizeByChar(jf: FuriRecord): number[] {
  const sizes: number[] = []
  for (const e of jf.furigana) {
    const n = [...e.ruby].length
    for (let i = 0; i < n; i++) sizes.push(n)
  }
  return sizes
}

/** 우리 코퍼스에서 JF 근거로 거부할 숙어들을 산정한다 */
export function computeRejects(
  idioms: IdiomRecord[],
  kanji: Record<string, KanjiReadings>,
  furi: FuriRecord[],
): Record<string, DecompOverride> {
  const lookup = (k: string) => kanji[k]
  const furiIndex = new Map<string, FuriRecord>()
  for (const f of furi) {
    const key = f.text + '\t' + f.reading
    if (!furiIndex.has(key)) furiIndex.set(key, f)
  }

  const out: Record<string, DecompOverride> = {}
  for (const it of idioms) {
    const d = decompose(it.headword, it.reading, lookup)
    if (!d.ok) continue // 이미 실패면 우리가 거부할 것도 없다
    const jf = furiIndex.get(it.headword + '\t' + it.reading)
    if (!jf) continue

    const grpSize = jfGroupSizeByChar(jf)
    const groupedIdx = new Set<number>()
    grpSize.forEach((sz, i) => {
      if (sz > 1) groupedIdx.add(i)
    })
    if (groupedIdx.size === 0) continue // JF 도 전부 낱자 → 경계 논쟁 아님 (12-B: 이 경우 충돌 0)

    // decompose 는 々 를 펼치므로 인덱스가 어긋날 수 있다. 어긋나면 "어디든 변형 있으면 유지"로 보수적 판정
    const comp = componentKanji(it.headword)
    const alignable = d.segments.length === comp.length
    const variantInGroup = alignable
      ? d.segments.some((s, i) => groupedIdx.has(i) && s.variants.length > 0)
      : d.segments.some((s) => s.variants.length > 0)
    if (variantInGroup) continue // 음운 파생 분해 — 우리가 맞다 (天皇 てん|のう 連声 등)

    out[it.id] = {
      action: 'reject',
      reason: 'JUKUJIKUN',
      jf: jf.furigana.map((e) => e.rt ?? e.ruby).join('|'),
      our: d.segments.map((s) => s.surface).join('|'),
      band: bandOf(it),
    }
  }
  return out
}

/** build-onyomi-map.ts 가 부른다. 파일이 없으면 빈 집합 (CI·JF 미다운로드 대비) */
export function loadDecompRejects(): Set<string> {
  if (!existsSync(OVERRIDE_PATH)) return new Set()
  const f = JSON.parse(readFileSync(OVERRIDE_PATH, 'utf8')) as OverrideFile
  return new Set(Object.keys(f.overrides))
}

function readFuri(): FuriRecord[] {
  if (!existsSync(FURI_PATH)) {
    console.error(`✗ ${FURI_PATH} 가 없다. JmdictFurigana.json 을 data/raw/ 에 내려받아라.`)
    console.error(`  https://github.com/Doublevil/JmdictFurigana/releases`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(FURI_PATH, 'utf8').replace(/^﻿/, '')) as FuriRecord[]
}

function main() {
  const validate = process.argv.includes('--validate')
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const { kanji } = JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
    kanji: Record<string, KanjiReadings>
  }
  const furi = readFuri()

  const overrides = computeRejects(idioms, kanji, furi)
  const ids = Object.keys(overrides)
  const byBand = [0, 0, 0, 0, 0]
  for (const id of ids) byBand[overrides[id].band]++

  console.log(`熟字訓 거부 ${ids.length}건 — 밴드 0:${byBand[0]} 1:${byBand[1]} 2:${byBand[2]} 3:${byBand[3]} 4:${byBand[4]}`)

  if (validate) {
    if (!existsSync(OVERRIDE_PATH)) {
      console.error('✗ decomp-overrides.json 이 없어 검증할 게 없다')
      process.exit(1)
    }
    const cur = JSON.parse(readFileSync(OVERRIDE_PATH, 'utf8')) as OverrideFile
    const was = new Set(Object.keys(cur.overrides))
    const now = new Set(ids)
    const added = [...now].filter((x) => !was.has(x))
    const dropped = [...was].filter((x) => !now.has(x))
    if (added.length === 0 && dropped.length === 0) {
      console.log('✓ 드리프트 없음 — 커밋된 목록과 일치')
      return
    }
    console.error(`✗ 드리프트: 추가 ${added.length} / 빠짐 ${dropped.length}`)
    for (const id of added.slice(0, 20)) console.error(`  + ${idioms.find((i) => i.id === id)?.headword} ${id}`)
    for (const id of dropped.slice(0, 20)) console.error(`  - ${cur.overrides[id].jf} ${id}`)
    process.exit(1)
  }

  const file: OverrideFile = {
    _meta: {
      source: 'JmdictFurigana (Doublevil), release 2.3.1+2026-08-25',
      rule: 'JF 가 묶은 다자 구간을 decompose 가 쪼갰고 그 구간에 음운 변형(連濁·連声·促音·半濁)이 없으면 熟字訓 으로 거부',
      generatedAt: new Date().toISOString(),
      count: ids.length,
    },
    overrides: Object.fromEntries(ids.sort((a, b) => Number(a) - Number(b)).map((id) => [id, overrides[id]])),
  }
  writeFileSync(OVERRIDE_PATH, JSON.stringify(file, null, 1) + '\n')
  console.log(`→ ${OVERRIDE_PATH}`)
}

if (import.meta.filename === process.argv[1]) main()
