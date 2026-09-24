// korean-meaning-worklist.tsv 의 사람 verdict 를 korean-class.json 의 koMeaning 에 반영한다 (checklist 12-D).
// apply:korean-review 로 korean-class.json 을 새로 만든 뒤 이걸 돌린다 (그 순서로 재현된다).
//   o  검수 통과            → verified: true
//   x  틀림 (fix 에 고친 정의) → definition 교체, source: manual, verified: true
//   ~  애매 (fix 에 메모)     → 그대로 (verified false 유지)
//   cat  분류 교정            → category 갱신
//
// **`s`(stdict 정의 채택)는 폐기했다** (2026-09-22 사용자 판단). 국어사전 정의는 한국어
// 낱말의 정의라 쓰임의 배경이 통째로 딸려 온다 — 発達 「신체, 정서, 지능 따위가…」 는
// 経済の発達·台風が発達する 를 정의에서 배제하고, 死語·水源地 는 한국 사전의 예시 꼬리
// (「고대 라틴어 따위가 있다」·「선상지 말단의 용수대」)를 달고 온다. 집 스타일(평균 6자)
// 과도 어긋난다(29.4자). 남아 있던 `s` 9건은 `~`로 받아 LLM 초벌로 되돌리고 미검수로
// 돌린다 — 폐기한 규칙 아래 내린 판정이라 그대로 쓸 수 없다. 근거는 context-notes 같은 날
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { normalizeDefinition } from './lib/meaning.ts'
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
  /** `stdict` 는 폐기된 옛 값이다 (위 주석). 새로 붙지 않는다 */
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

const tally = { o: 0, x: 0, s: 0, '~': 0, cat: 0, inlineEdit: 0, skip: 0, missing: 0, added: 0 }
/** 폐기한 `s` 가 아직 남아 있는 행 수. 0 이 되면 워크리스트에서 그 판정이 사라진 것이다 */
let legacyS = 0
const perTier: Record<string, { o: number; x: number; s: number; '~': number; edited: number }> = {}
const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
// 구분자까지 맞춘 비교용. 이걸 안 쓰면 워크리스트에 남은 옛 "; " 표기가
// *사람이 고친 값* 으로 오인돼 검수분이 통째로 source: manual 로 뒤집힌다
const sameText = (a: string, b: string) => norm(normalizeDefinition(a)) === norm(normalizeDefinition(b))

/**
 * 번역본에서 뜻을 꺼낸다 — 분류표에 없는 숙어(담아 둔 밴드 4)용 (2026-09-24).
 * `korean-class.json` 은 한국어 대조를 돌린 밴드 0~3 만 담아서, 담긴 밴드 4 의 판정은
 * 반영될 자리가 없었다(`tally.missing` 으로 세고 버렸다).
 */
const MEANING_PATH = join(DICT_DIR, 'korean-meaning.json')
const llmById: Record<string, { ko: string; glossEn: string[] }> = existsSync(MEANING_PATH)
  ? (JSON.parse(readFileSync(MEANING_PATH, 'utf8')).byId as Record<
      string,
      { ko: string; glossEn: string[] }
    >)
  : {}

for (const [id, { verdict, cat, fix, llmKo, tier }] of merged) {
  let entry = cls.byId[id]
  if (!entry) {
    // 판정이 실린 숙어인데 분류표에 없다 = 담아 둔 밴드 4 다. **자리를 만들어 받는다.**
    // 분류는 한국어 대조를 안 돌린 것이라 기본값(확장)이다 — 「모른다」지 「아니다」가 아니다
    const llm = llmById[id]
    if (!llm?.ko) {
      tally.missing++
      continue
    }
    entry = {
      category: 2,
      classSource: 'default',
      koMeaning: {
        definition: normalizeDefinition(llm.ko),
        glossEn: llm.glossEn,
        source: 'llm',
        verified: false,
      },
    }
    cls.byId[id] = entry
    tally.added++
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
  const inlineFix = fix || (llmKo && !sameText(llmKo, km.definition) ? llmKo : '')

  if (verdict === 'o') {
    if (inlineFix) {
      km.definition = normalizeDefinition(inlineFix)
      km.source = 'manual'
      tally.inlineEdit++
      perTier[tier].edited++
    }
    km.verified = true
  } else if (verdict === 's') {
    // 폐기한 판정 (위 주석). 뜻은 LLM 초벌 그대로, verified 는 false 로 남겨 다시 검수하게 둔다
    legacyS++
  } else if (verdict === 'x') {
    if (!inlineFix) {
      console.warn(`  ⚠ ${id} verdict x 인데 고친 뜻(fix/llm_ko)이 없다 — 건너뜀`)
      tally.x--
      perTier[tier].x--
      continue
    }
    km.definition = normalizeDefinition(inlineFix)
    km.source = 'manual'
    km.verified = true
  }
  // '~' 는 상태 변화 없음 (메모만). 폐기한 `s` 도 여기로 떨어져 LLM 초벌인 채 미검수로 남는다
  entry.koMeaning = km
}

if (legacyS > 0) {
  console.warn(
    `  ⚠ 폐기한 verdict 's' 가 ${legacyS}건 남아 있다 — 뜻은 LLM 초벌로 두고 미검수로 돌렸다.` +
      ' 워크리스트에서 다시 판정하면 된다 (o/x/~)',
  )
}

const verifiedTotal = Object.values(cls.byId).filter((e) => e.koMeaning?.verified).length

if (VALIDATE) {
  console.log('=== 층별 검수 결과 (--validate) ===')
  for (const [t, v] of Object.entries(perTier).sort()) {
    // `s` 는 폐기한 판정이라 **결론이 없는 행**이다. 모수에서도 불량에서도 뺀다 —
    // 예전엔 불량으로 셌는데(2026-09-22 이전) 그게 T6 불량률을 11.8% 로 부풀렸다
    const seen = v.o + v.x
    const wrong = v.x + v.edited // 번역이 틀려서 손댄 것 (x·인라인 수정)
    console.log(
      `  tier ${t}: o ${v.o}(수정 ${v.edited}) · x ${v.x} · ~ ${v['~']}` +
        (v.s ? ` · 재판정 필요 ${v.s}` : '') +
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
console.log(`  o ${tally.o} · x ${tally.x} · s ${tally.s} · ~ ${tally['~']} (인라인 수정 ${tally.inlineEdit}) · 분류교정 ${tally.cat} · 미기입 ${tally.skip} · id 없음 ${tally.missing}개 · 새 자리 ${tally.added}`)
console.log(`  koMeaning.verified 총 ${verifiedTotal}`)
console.log(`  → ${CLASS_PATH}  (build:runtime-dict 재실행 필요)`)
