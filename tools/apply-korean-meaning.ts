// korean-meaning-worklist.tsv 의 사람 verdict 를 korean-class.json 의 koMeaning 에 반영한다 (checklist 12-D).
// apply:korean-review 로 korean-class.json 을 새로 만든 뒤 이걸 돌린다 (그 순서로 재현된다).
//   o  검수 통과            → verified: true
//   x  틀림 (fix 에 고친 정의) → definition 교체, source: manual, verified: true
//   s  stdict_def 채택        → definition = stdict 정의, source: stdict, verified: true
//   ~  애매 (fix 에 메모)     → 그대로 (verified false 유지)
//   cat  분류 교정            → category 갱신
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv } from './lib/tsv.ts'

const VALIDATE = process.argv.includes('--validate')
const CLASS_PATH = join(DICT_DIR, 'korean-class.json')
// 표본 파일 + flagged 파일 등 korean-meaning-worklist*.tsv 전부에서 verdict 를 읽는다
const WORKLISTS = readdirSync(DICT_DIR).filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f))

if (!existsSync(CLASS_PATH) || WORKLISTS.length === 0) {
  console.error(`${CLASS_PATH} 또는 korean-meaning-worklist*.tsv 가 없다.`)
  process.exit(1)
}

interface KoMeaning {
  definition: string
  glossEn?: string[]
  source: 'stdict' | 'llm' | 'manual'
  verified: boolean
}
interface KoClass {
  category: 1 | 2 | 3
  classSource: 'llm' | 'default' | 'manual'
  koMeaning: KoMeaning | null
}
const cls = JSON.parse(readFileSync(CLASS_PATH, 'utf8')) as {
  _meta: Record<string, unknown>
  stats: Record<string, unknown>
  byId: Record<string, KoClass>
}

// stdict 정의 (s verdict 용)
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

// 여러 파일을 합친다. 파일 순서(readdirSync = -flagged 먼저)대로, **먼저 본 실제 verdict 가 이긴다** —
// 뒤 파일(표본 등)에 남은 중복 행이 앞 파일의 검수를 덮지 못하게 한다.
// llm_ko 를 같이 읽는다 — 사람이 그 칸을 직접 고치고 verdict 만 찍는 방식도 지원한다.
const merged = new Map<string, { verdict: string; cat: string; fix: string; llmKo: string; tier: string }>()
for (const f of WORKLISTS) {
  const grid = readTsv(join(DICT_DIR, f))
  const wh = grid[0]
  const col = Object.fromEntries(
    ['verdict', 'cat', 'fix', 'llm_ko', 'tier', 'id'].map((k) => [k, wh.indexOf(k)]),
  )
  if (col.id < 0) continue
  for (const c of grid.slice(1)) {
    const id = c[col.id]
    if (!id) continue
    const verdict = (c[col.verdict] ?? '').trim()
    const cat = (c[col.cat] ?? '').trim()
    const prev = merged.get(id)
    // 이미 실제 verdict 를 잡았으면 유지하고, 뒤 파일에선 분류 교정만 받는다
    if (prev && /^[oxs~]$/.test(prev.verdict)) {
      if (/^[123]$/.test(cat)) prev.cat = cat
      continue
    }
    if (prev && !/^[oxs~]$/.test(verdict) && !/^[123]$/.test(cat)) continue
    merged.set(id, {
      verdict,
      cat,
      fix: (c[col.fix] ?? '').trim(),
      llmKo: (c[col.llm_ko] ?? '').trim(),
      tier: c[col.tier] ?? '?',
    })
  }
}
console.log(`검수 파일 ${WORKLISTS.length}개, 행 ${merged.size}개 병합`)

const tally = { o: 0, x: 0, s: 0, '~': 0, cat: 0, inlineEdit: 0, skip: 0, missing: 0 }
const perTier: Record<string, { o: number; x: number; s: number; '~': number; edited: number }> = {}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()

for (const [id, { verdict, cat, fix, llmKo, tier }] of merged) {
  const entry = cls.byId[id]
  if (!entry) {
    tally.missing++
    continue
  }

  if (/^[123]$/.test(cat) && Number(cat) !== entry.category) {
    entry.category = Number(cat) as 1 | 2 | 3
    tally.cat++
  }

  if (!/^[oxs~]$/.test(verdict)) {
    tally.skip++
    continue
  }
  perTier[tier] ??= { o: 0, x: 0, s: 0, '~': 0, edited: 0 }
  perTier[tier][verdict as 'o' | 'x' | 's' | '~']++
  tally[verdict as 'o' | 'x' | 's' | '~']++

  const km: KoMeaning = entry.koMeaning ?? { definition: '', source: 'llm', verified: false }
  // 인라인 수정 — llm_ko 칸을 사람이 직접 고쳤으면(현재 definition 과 다르면) 그 텍스트를 채택한다.
  // fix 칸에 적는 대신 llm_ko 를 바로 고치고 verdict 만 찍는 방식 지원 (사용자 워크플로)
  const inlineFix = fix || (llmKo && norm(llmKo) !== norm(km.definition) ? llmKo : '')

  if (verdict === 'o') {
    if (inlineFix) {
      km.definition = inlineFix
      km.source = 'manual'
      tally.inlineEdit++
      perTier[tier].edited++
    }
    km.verified = true
  } else if (verdict === 'x') {
    if (!inlineFix) {
      console.warn(`  ⚠ ${id} verdict x 인데 고친 뜻(fix/llm_ko)이 없다 — 건너뜀`)
      tally.x--
      perTier[tier].x--
      continue
    }
    km.definition = inlineFix
    km.source = 'manual'
    km.verified = true
  } else if (verdict === 's') {
    const sd = stdictDef.get(id)
    if (!sd) {
      console.warn(`  ⚠ ${id} verdict s 인데 stdict 정의가 없다 — 건너뜀`)
      tally.s--
      perTier[tier].s--
      continue
    }
    km.definition = sd
    km.source = 'stdict'
    km.verified = true
  }
  // '~' 는 상태 변화 없음 (메모만)
  entry.koMeaning = km
}

const verifiedTotal = Object.values(cls.byId).filter((e) => e.koMeaning?.verified).length

if (VALIDATE) {
  console.log('=== 층별 검수 결과 (--validate) ===')
  for (const [t, v] of Object.entries(perTier).sort()) {
    const seen = v.o + v.x + v.s
    const wrong = v.x + v.s + v.edited // 번역이 틀려서 손댄 것 (x·s·인라인 수정)
    console.log(
      `  tier ${t}: o ${v.o}(수정 ${v.edited}) · x ${v.x} · s ${v.s} · ~ ${v['~']}` +
        (seen ? `  → 손댄 비율 ${((wrong / seen) * 100).toFixed(1)}% (${wrong}/${seen})` : ''),
    )
  }
  console.log(`\n인라인 수정 ${tally.inlineEdit} · 분류 교정 ${tally.cat} · 전체 verified: ${verifiedTotal}`)
  process.exit(0)
}

cls._meta.meaningReviewedAt = new Date().toISOString()
cls.stats.koMeaningVerified = verifiedTotal
writeFileSync(CLASS_PATH, JSON.stringify(cls))

console.log('=== 뜻 검수 반영 ===')
console.log(`  o ${tally.o} · x ${tally.x} · s ${tally.s} · ~ ${tally['~']} (인라인 수정 ${tally.inlineEdit}) · 분류교정 ${tally.cat} · 미기입 ${tally.skip} · id 없음 ${tally.missing}`)
console.log(`  koMeaning.verified 총 ${verifiedTotal}`)
console.log(`  → ${CLASS_PATH}  (build:runtime-dict 재실행 필요)`)
