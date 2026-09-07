// 화면에 뜨는 한국어 뜻(koMeaning)이 맞는지 한일 이중언어 화자가 확인할 작업 파일 (checklist 12-D).
//
// 방향 변경(2026-09-07): koMeaning 은 이제 stdict 정의가 아니라 JMdict 영어 gloss 를 옮긴 것
// (build:korean-meaning, gemma4). 검수 질문이 "국어사전과 뜻이 갈리나"에서 "이 한 줄이 영어
// 뜻을 맞게·자연스럽게 옮겼나"로 바뀐다. 대신 gemma4 환각 때문에 한 번씩은 봐야 한다.
//
// 한 줄에 glossEn(원본) · llm_ko(검증 대상) · stdict_def(참고) · Phase 3 수동 분류 verdict/근거
// 를 나란히 놓는다. 수동 검수분(355 + 표본 200)과 품질 플래그가 붙은 행을 맨 앞으로.
//
// 사람은 verdict (+ 필요시 cat·fix) 만 채운다 —
//   o  맞다              → apply 가 verified:true
//   x  틀리다            → fix 칸에 고친 한국어 정의. verified:true, source:manual
//   ~  애매/어색          → verified 는 false 유지, fix 에 메모
//   s  stdict_def 채택     → 그 정의로 교체, verified:true, source:stdict (수동 분류 노동 보존)
//   ?  미기입
// cat  분류(1 동형동의 / 2 동형이의 / 3 일본고유)가 틀렸으면 고친 값. 비우면 그대로.
import { existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { priorityToBand } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'

interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: { definition: string; source: string; verified: boolean } | null
}
interface MeaningEntry {
  ko: string
  glossEn: string[]
  flags: string[]
}

// --flagged 는 별도 파일로 — tier별 표본 파일과 나란히 둔다
const OUT_PATH = join(
  DICT_DIR,
  process.argv.includes('--flagged') ? 'korean-meaning-worklist-flagged.tsv' : 'korean-meaning-worklist.tsv',
)
const sampleArg = process.argv.find((a) => a.startsWith('--sample='))?.split('=')[1]
const wantAll = process.argv.includes('--all')
// --flagged: 표본 없이 품질 플래그(깨진 번역·cat 불일치 등)가 붙은 행 전량만. 최우선 검수 목록
const flaggedOnly = process.argv.includes('--flagged')
const perTier = sampleArg ? Math.max(1, Number(sampleArg)) : wantAll || flaggedOnly ? Infinity : 30
const SEED = 20260907

const need = (p: string) => {
  if (!existsSync(p)) {
    console.error(`${p} 가 없다.`)
    process.exit(1)
  }
  return p
}
const { byId } = JSON.parse(readFileSync(need(join(DICT_DIR, 'korean-class.json')), 'utf8')) as {
  byId: Record<string, KoClass>
}
const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as { idioms: IdiomRecord[] }
const idiomById = new Map(idioms.map((i) => [i.id, i]))

// 영어 gloss 번역 (없으면 stdict 폴백만 있는 상태 — 그런 행은 llm_ko 가 빈다)
const meaning: Record<string, MeaningEntry> = existsSync(join(DICT_DIR, 'korean-meaning.json'))
  ? (JSON.parse(readFileSync(join(DICT_DIR, 'korean-meaning.json'), 'utf8')).byId as Record<string, MeaningEntry>)
  : {}

// stdict 정의 (참고 열) — korean-review.tsv 의 ko_definition
const stdictDef = new Map<string, string>()
{
  const p = join(DICT_DIR, 'korean-review.tsv')
  if (existsSync(p)) {
    const lines = readFileSync(p, 'utf8').split('\n')
    const h = lines[0].split('\t')
    const [di, ii] = [h.indexOf('ko_definition'), h.indexOf('id')]
    for (const l of lines.slice(1)) {
      const c = l.split('\t')
      if (c[ii]) stdictDef.set(c[ii], (c[di] ?? '').replace(/\s+/g, ' '))
    }
  }
}

// Phase 3 수동 분류 verdict + 근거 — korean-worklist*.tsv 의 채워진 verdict + korean-review-sample.tsv 라벨
const manual = new Map<string, { verdict: 1 | 2 | 3; reason: string }>()
for (const f of readdirSync(DICT_DIR).filter((f) => /^korean-(worklist.*|review-sample)\.tsv$/.test(f))) {
  const lines = readFileSync(join(DICT_DIR, f), 'utf8').split('\n')
  const h = lines[0].split('\t')
  const [vi, ii, ri] = [h.indexOf('verdict'), h.indexOf('id'), h.indexOf('llm_reason')]
  for (const l of lines.slice(1)) {
    const c = l.split('\t')
    const v = (c[vi] ?? '').trim()
    if (c[ii] && /^[123]$/.test(v)) manual.set(c[ii], { verdict: Number(v) as 1 | 2 | 3, reason: (c[ri] ?? '').replace(/\s+/g, ' ') })
  }
}

// 채운 verdict·cat·fix 이어받기 — 표본 파일과 flagged 파일 양쪽에서 (어느 쪽에 적어도 산다)
const prior = new Map<string, { verdict: string; cat: string; fix: string }>()
for (const f of readdirSync(DICT_DIR).filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f))) {
  const lines = readFileSync(join(DICT_DIR, f), 'utf8').split('\n')
  const h = lines[0].split('\t')
  const [vi, ci, fi, ii] = [h.indexOf('verdict'), h.indexOf('cat'), h.indexOf('fix'), h.indexOf('id')]
  if (ii < 0) continue
  for (const l of lines.slice(1)) {
    const c = l.split('\t')
    const v = (c[vi] ?? '').trim()
    if (c[ii] && /^[ox~s]$/.test(v)) {
      prior.set(c[ii], { verdict: v, cat: (c[ci] ?? '').trim(), fix: (c[fi] ?? '').trim() })
    }
  }
}

const BROKEN = new Set(['empty', 'error', 'latin', 'cyrillic', 'kanji', 'kana', 'untranslated'])

interface Row {
  id: string
  it: IdiomRecord
  k: KoClass
  m?: MeaningEntry
  flags: string[]
  isManual: boolean
  catMismatch: boolean
  tier: number
}

const rows: Row[] = []
for (const [id, k] of Object.entries(byId)) {
  if (!k.koMeaning) continue
  const it = idiomById.get(id)
  if (!it) continue
  const m = meaning[id]
  const mv = manual.get(id)
  const flags = [...(m?.flags ?? [])]
  const catMismatch = !!mv && mv.verdict !== k.category
  if (catMismatch) flags.push('cat-mismatch')
  const isManual = !!mv || k.classSource === 'manual'
  const broken = flags.some((f) => BROKEN.has(f))

  // 우선순위 tier — 낮을수록 먼저
  let tier: number
  if (catMismatch) tier = 1
  else if (broken) tier = 2
  else if (isManual && k.category === 2) tier = 1
  else if (isManual) tier = 3
  else if (k.category === 2) tier = 4
  else if (k.category === 3) tier = 5
  else tier = 6

  rows.push({ id, it, k, m, flags, isManual, catMismatch, tier })
}

// tier 안에서 결정론적 셔플 후 표본
function shuffle<T>(a: T[]): T[] {
  let s = SEED
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
const byTier = new Map<number, Row[]>()
for (const r of rows) (byTier.get(r.tier) ?? byTier.set(r.tier, []).get(r.tier)!).push(r)

let picked: Row[]
if (flaggedOnly) {
  // 플래그가 붙은 행 전량 (깨진 번역 · cat 불일치). 표본 안 뽑는다
  picked = rows.filter((r) => r.flags.length > 0)
} else {
  picked = []
  for (const [, list] of [...byTier].sort((a, b) => a[0] - b[0])) {
    const kept = list.filter((r) => prior.has(r.id))
    const rest = shuffle(list.filter((r) => !prior.has(r.id)))
    const take = Number.isFinite(perTier) ? Math.max(0, perTier - kept.length) : Infinity
    picked.push(...kept, ...rest.slice(0, take))
  }
}
picked.sort((a, b) => a.tier - b.tier || a.k.category - b.k.category || priorityToBand(a.it.priority) - priorityToBand(b.it.priority) || a.it.headword.localeCompare(b.it.headword))

const header = [
  'verdict', 'cat', 'fix', 'tier', 'flags', 'manual',
  'headword', 'reading', 'glossEn', 'llm_ko', 'stdict_def', 'manual_reason',
  'category', 'classSource', 'band', 'id',
].join('\t')

const body = picked.map((r) => {
  const p = prior.get(r.id)
  return [
    p?.verdict ?? '?',
    p?.cat ?? '',
    p?.fix ?? '',
    r.tier,
    r.flags.join(','),
    r.isManual ? (manual.get(r.id) ? `Y(${manual.get(r.id)!.verdict})` : 'Y') : '',
    r.it.headword,
    r.it.reading,
    r.it.glossEn.slice(0, 4).join('; '),
    r.m?.ko ?? '',
    stdictDef.get(r.id) ?? '',
    manual.get(r.id)?.reason ?? '',
    r.k.category,
    r.k.classSource,
    priorityToBand(r.it.priority),
    r.id,
  ].join('\t')
})

writeFileSync(OUT_PATH, header + '\n' + body.join('\n') + '\n')

const mode = flaggedOnly ? '플래그 전량' : Number.isFinite(perTier) ? `tier별 표본 ${perTier}` : '전체'
console.log(`→ ${OUT_PATH}  (${picked.length}행, ${mode}, 이어받은 verdict ${prior.size}건)`)

// 플래그 분해 — 무엇을 왜 검수해야 하는지
const FLAG_NOTE: Record<string, string> = {
  error: '번역 실패 (빈 뜻)',
  latin: '인코딩 깨짐 (<0x..>) 또는 영어 잔존 — 반드시 고침',
  cyrillic: '키릴 문자 — 반드시 고침',
  kana: '일본어 가나 잔존',
  kanji: '한자 잔존 (괄호 병기는 대개 良性)',
  untranslated: '영어 gloss 를 그대로 둠',
  'many-senses': '뜻이 너무 잘게 나뉨',
  long: '40자 초과',
  empty: '빈 뜻',
  'cat-mismatch': '수동 분류와 category 불일치',
}
const flagCount: Record<string, number> = {}
for (const r of rows) for (const f of r.flags) flagCount[f in FLAG_NOTE ? f : 'error'] = (flagCount[f in FLAG_NOTE ? f : 'error'] ?? 0) + 1
const flaggedRows = rows.filter((r) => r.flags.length > 0).length
const qualityRows = rows.filter((r) => r.flags.some((f) => f !== 'cat-mismatch')).length
console.log(`\n검수 필요 — 전체 ${flaggedRows}행 (번역 품질 ${qualityRows} + 분류 불일치 ${flagCount['cat-mismatch'] ?? 0}), 이번 파일 ${picked.filter((r) => r.flags.length > 0).length}행`)
for (const [f, n] of Object.entries(flagCount).sort((a, b) => b[1] - a[1])) {
  console.log(`   ${f.padEnd(13)} ${String(n).padStart(4)}   ${FLAG_NOTE[f] ?? ''}`)
}

const tierLabel: Record<number, string> = {
  1: '수동검수·동형이의 / 분류 불일치  최우선',
  2: '출력 이상 플래그  깨진 번역',
  3: '수동검수·동형동의·일본고유',
  4: '동형이의 (미검수)',
  5: '일본고유 (뜻이 새로 생김)',
  6: '동형동의 (미검수)  훑기',
}
console.log('\ntier별 (전체 / 이번 파일):')
for (const [t, list] of [...byTier].sort((a, b) => a[0] - b[0])) {
  const inFile = picked.filter((r) => r.tier === t).length
  console.log(`  T${t} ${String(list.length).padStart(6)} / ${String(inFile).padStart(4)}   ${tierLabel[t]}`)
}
console.log(`\n검수 표기 — o 맞음 · x 틀림(fix) · ~ 애매(fix 메모) · s stdict_def 채택 · ? 미기입`)
console.log(`깨진 것만 전량 보려면 --flagged · 전체 --all · tier별 표본 --sample=N`)
