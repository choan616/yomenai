// koMeaning(화면에 뜨는 한국어 뜻)이 그 일본어 숙어에 맞는지 사람이 확인할 작업 파일을 만든다 (checklist Phase 12-D).
//
// Phase 3 은 "같은 단어인가"(category 1/2/3)를 검수했다. 여기는 그다음 질문 — "이 koMeaning.definition
// 텍스트가 이 일본어 단어의 뜻으로 맞는가" 다. 지금 13,570건 전부 verified:false 이고, 동형이의
// (category 2)에서 틀린 뜻을 보여주면 사용자가 잘못 배운다. 그래서 category 2·미검수(default)부터.
//
// 사람은 verdict (+ 필요하면 cat·fix) 칸만 채운다 —
//   o  맞다              → apply 가 verified:true
//   x  틀리다            → fix 칸에 고친 한국어 정의를 적는다. verified:true, source:manual
//   ~  애매/어색하지만 아주 틀리진 않음 → verified 는 false 유지, fix 에 메모 (경계 사례 추적용)
//   ?  미기입
// cat 칸 — 분류(1 동형동의 / 2 동형이의 / 3 일본고유)가 틀렸으면 고친 값. 비우면 그대로.
//   default(잠정 2번)에 사실은 1인 게 많이 섞여 있다(開閉·民心 류). 한 번 볼 때 같이 고친다.
//
// 기본은 층별 표본(--sample=N, 층마다 N행). --all 로 우선순위 순 전체.
// 한일 이중언어 화자면 되고 일본어 전문가일 필요는 없다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { priorityToBand } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'

interface KoMeaning {
  word: string
  origin: string
  definition: string
  source: string
  verified: boolean
}
interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: KoMeaning | null
}

const CLASS_PATH = join(DICT_DIR, 'korean-class.json')
const DRAFT_PATH = join(DICT_DIR, 'korean-llm-draft.tsv')
const OUT_PATH = join(DICT_DIR, 'korean-meaning-worklist.tsv')

const sampleArg = process.argv.find((a) => a.startsWith('--sample='))?.split('=')[1]
const wantAll = process.argv.includes('--all')
const perStratum = sampleArg ? Math.max(1, Number(sampleArg)) : wantAll ? Infinity : 30
const SEED = 20260907

if (!existsSync(CLASS_PATH)) {
  console.error(`${CLASS_PATH} 가 없다. apply:korean-review 를 먼저 실행한다.`)
  process.exit(1)
}

const { byId } = JSON.parse(readFileSync(CLASS_PATH, 'utf8')) as { byId: Record<string, KoClass> }
const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as { idioms: IdiomRecord[] }
const idiomById = new Map(idioms.map((i) => [i.id, i]))

// LLM 초벌 사유 (검수자 참고용)
const draftReason = new Map<string, string>()
if (existsSync(DRAFT_PATH)) {
  const dl = readFileSync(DRAFT_PATH, 'utf8').split('\n')
  const dh = dl[0].split('\t')
  const [di, dr] = [dh.indexOf('id'), dh.indexOf('reason')]
  for (const l of dl.slice(1)) {
    const c = l.split('\t')
    if (c[di]) draftReason.set(c[di], (c[dr] ?? '').replace(/\s+/g, ' '))
  }
}

// 이전 작업 파일에서 채운 verdict·cat·fix 이어받기
const priorVerdict = new Map<string, string>()
const priorFix = new Map<string, string>()
const priorCat = new Map<string, string>()
if (existsSync(OUT_PATH)) {
  const ol = readFileSync(OUT_PATH, 'utf8').split('\n')
  const oh = ol[0].split('\t')
  const [ov, oc, of_, oi] = [oh.indexOf('verdict'), oh.indexOf('cat'), oh.indexOf('fix'), oh.indexOf('id')]
  for (const l of ol.slice(1)) {
    const c = l.split('\t')
    const v = (c[ov] ?? '').trim()
    if (c[oi] && /^[ox~]$/.test(v)) {
      priorVerdict.set(c[oi], v)
      if (c[of_]?.trim()) priorFix.set(c[oi], c[of_].trim())
      if (oc >= 0 && /^[123]$/.test((c[oc] ?? '').trim())) priorCat.set(c[oi], c[oc].trim())
    }
  }
}

/**
 * 검수 우선순위 — 낮을수록 먼저.
 * 1  동형이의 · 미검수(default)  틀린 뜻을 교정 모드에서 그대로 보여준다. 검증 0. 가장 큼
 * 2  동형이의 · LLM 초벌          작지만 위험도 높음
 * 3  동형이의 · 분류만 사람 확인  뜻 텍스트는 아직 미검증
 * 4  동형동의 · LLM 초벌          같은 단어면 stdict 정의가 대개 맞다. 훑기
 * 5  동형동의 · 분류만 사람 확인
 */
function priorityOf(k: KoClass): number {
  if (k.category === 2) return k.classSource === 'default' ? 1 : k.classSource === 'llm' ? 2 : 3
  if (k.category === 1) return k.classSource === 'llm' ? 4 : 5
  return 9 // category 3 은 koMeaning 이 없어 여기 안 온다
}
const stratumOf = (k: KoClass) => `${k.category}/${k.classSource}`

interface Row {
  id: string
  priority: number
  stratum: string
  band: number
  it: IdiomRecord
  km: KoMeaning
}

const rows: Row[] = []
for (const [id, k] of Object.entries(byId)) {
  if (!k.koMeaning) continue
  const it = idiomById.get(id)
  if (!it) continue
  rows.push({ id, priority: priorityOf(k), stratum: stratumOf(k), band: priorityToBand(it.priority), it, km: k.koMeaning })
}

// 결정론적 셔플 (표본 추출용) — 층 안에서만 섞는다
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const byStratum = new Map<string, Row[]>()
for (const r of rows) {
  const list = byStratum.get(r.stratum)
  if (list) list.push(r)
  else byStratum.set(r.stratum, [r])
}

const picked: Row[] = []
for (const [, list] of byStratum) {
  const already = list.filter((r) => priorVerdict.has(r.id))
  const rest = seededShuffle(list.filter((r) => !priorVerdict.has(r.id)), SEED)
  // 이미 검수된 건 항상 유지 + 나머지에서 표본 채우기
  const need = Number.isFinite(perStratum) ? Math.max(0, perStratum - already.length) : Infinity
  picked.push(...already, ...rest.slice(0, need))
}

picked.sort(
  (a, b) =>
    a.priority - b.priority ||
    a.band - b.band ||
    a.it.headword.localeCompare(b.it.headword),
)

const header = [
  'verdict', 'cat', 'fix', 'stratum', 'priority', 'category', 'classSource', 'band',
  'headword', 'reading', 'ko_word', 'ko_origin', 'ko_definition', 'glossEn', 'llm_reason', 'id',
].join('\t')

const body = picked.map((r) => {
  const k = byId[r.id]
  return [
    priorVerdict.get(r.id) ?? '?',
    priorCat.get(r.id) ?? '',
    priorFix.get(r.id) ?? '',
    r.stratum,
    r.priority,
    k.category,
    k.classSource,
    r.band,
    r.it.headword,
    r.it.reading,
    r.km.word,
    r.km.origin,
    r.km.definition.replace(/\s+/g, ' '),
    r.it.glossEn.slice(0, 3).join('; '),
    draftReason.get(r.id) ?? '',
    r.id,
  ].join('\t')
})

writeFileSync(OUT_PATH, header + '\n' + body.join('\n') + '\n')

const mode = Number.isFinite(perStratum) ? `층별 표본 ${perStratum}` : '전체'
console.log(`→ ${OUT_PATH}  (${picked.length}행, ${mode}, 이어받은 verdict ${priorVerdict.size}건)`)
console.log(`\n층별 (전체 / 이번 파일):`)
const labels: Record<number, string> = {
  1: '동형이의·미검수  틀린 뜻 위험 최대',
  2: '동형이의·LLM초벌',
  3: '동형이의·분류만 사람',
  4: '동형동의·LLM초벌  훑기',
  5: '동형동의·분류만 사람',
}
for (const [strat, list] of [...byStratum].sort((a, b) => priorityOf(byId[a[1][0].id]) - priorityOf(byId[b[1][0].id]))) {
  const inFile = picked.filter((r) => r.stratum === strat).length
  const p = priorityOf(byId[list[0].id])
  console.log(`  P${p} ${strat.padEnd(12)} ${String(list.length).padStart(6)} / ${String(inFile).padStart(4)}   ${labels[p] ?? ''}`)
}
console.log(`\n검수 표기 — o 맞음 · x 틀림(fix 칸에 고친 정의) · ~ 애매(fix 에 메모) · ? 미기입`)
console.log(`전체를 보려면 --all, 층별 표본 크기는 --sample=N`)
