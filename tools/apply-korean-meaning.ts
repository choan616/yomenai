// korean-meaning-worklist.tsv 의 사람 verdict 를 korean-class.json 의 koMeaning 에 반영한다 (checklist 12-D).
// apply:korean-review 로 korean-class.json 을 새로 만든 뒤 이걸 돌린다 (그 순서로 재현된다).
//   o  검수 통과            → verified: true
//   x  틀림 (fix 에 고친 정의) → definition 교체, source: manual, verified: true
//   s  stdict_def 채택        → definition = stdict 정의, source: stdict, verified: true
//   ~  애매 (fix 에 메모)     → 그대로 (verified false 유지)
//   cat  분류 교정            → category 갱신
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'

const VALIDATE = process.argv.includes('--validate')
const CLASS_PATH = join(DICT_DIR, 'korean-class.json')
const WORKLIST_PATH = join(DICT_DIR, 'korean-meaning-worklist.tsv')

for (const p of [CLASS_PATH, WORKLIST_PATH]) {
  if (!existsSync(p)) {
    console.error(`${p} 가 없다.`)
    process.exit(1)
  }
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

const wl = readFileSync(WORKLIST_PATH, 'utf8').split('\n')
const wh = wl[0].split('\t')
const col = Object.fromEntries(['verdict', 'cat', 'fix', 'tier', 'id'].map((k) => [k, wh.indexOf(k)]))

const tally = { o: 0, x: 0, s: 0, '~': 0, cat: 0, skip: 0, missing: 0 }
const perTier: Record<string, { o: number; x: number; s: number; '~': number }> = {}

for (const line of wl.slice(1)) {
  if (!line.trim()) continue
  const c = line.split('\t')
  const id = c[col.id]
  const verdict = (c[col.verdict] ?? '').trim()
  const cat = (c[col.cat] ?? '').trim()
  const fix = (c[col.fix] ?? '').trim()
  const tier = c[col.tier] ?? '?'
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
  perTier[tier] ??= { o: 0, x: 0, s: 0, '~': 0 }
  perTier[tier][verdict as 'o' | 'x' | 's' | '~']++
  tally[verdict as 'o' | 'x' | 's' | '~']++

  const km: KoMeaning = entry.koMeaning ?? { definition: '', source: 'llm', verified: false }
  if (verdict === 'o') {
    km.verified = true
  } else if (verdict === 'x') {
    if (!fix) {
      console.warn(`  ⚠ ${id} verdict x 인데 fix 가 비었다 — 건너뜀`)
      tally.x--
      perTier[tier].x--
      continue
    }
    km.definition = fix
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
    const wrong = v.x + v.s // 번역이 틀려서 손댄 비율
    console.log(
      `  tier ${t}: o ${v.o} · x ${v.x} · s ${v.s} · ~ ${v['~']}` +
        (seen ? `  → 손댄 비율 ${((wrong / seen) * 100).toFixed(1)}% (${wrong}/${seen})` : ''),
    )
  }
  console.log(`\n전체 verified: ${verifiedTotal}`)
  process.exit(0)
}

cls._meta.meaningReviewedAt = new Date().toISOString()
cls.stats.koMeaningVerified = verifiedTotal
writeFileSync(CLASS_PATH, JSON.stringify(cls))

console.log('=== 뜻 검수 반영 ===')
console.log(`  o ${tally.o} · x ${tally.x} · s ${tally.s} · ~ ${tally['~']} · 분류교정 ${tally.cat} · 미기입 ${tally.skip} · id 없음 ${tally.missing}`)
console.log(`  koMeaning.verified 총 ${verifiedTotal}`)
console.log(`  → ${CLASS_PATH}  (build:runtime-dict 재실행 필요)`)
