// JMdict 영어 gloss → 한국어 뜻(gemma4:latest)을 코퍼스 밴드 0~3 전량에 대해 만든다.
// stdict 대조본을 대체한다 (checklist 12-D 방향 변경, context-notes 2026-09-07).
// .korean-meaning-cache.json 로 중단 지점 재개. 산출물 data/dict/korean-meaning.json 은 gitignore.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { qualityFlags, translateGloss } from './lib/translate-gloss.ts'

const OUT = join(DICT_DIR, 'korean-meaning.json')
const OUT_WIDE = join(DICT_DIR, 'korean-meaning-wide.json')
const CACHE = join(DICT_DIR, '.korean-meaning-cache.json')

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const MODEL = arg('model') ?? 'gemma4:latest'
const LIMIT = arg('limit') ? Number(arg('limit')) : Infinity
const MAX_BAND = arg('band') ? Number(arg('band')) : 3

interface Entry {
  ko: string
  glossEn: string[]
  model: string
  flags: string[]
}

const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
  idioms: IdiomRecord[]
}

/** 번역에 필요한 것만. 학습 사전과 넓힌 사전이 같은 모양으로 들어온다 */
type Target = { id: string; headword: string; reading: string; glossEn: string[] }

/**
 * `--wide`: 넓힌 사전(`public/dict/wide.json`)도 대상에 넣는다 (2026-09-26).
 *
 * 넓힌 사전 항목은 **`idioms.json` 에 아예 없다** — 상용한자 밖 글자가 섞여 임포터가
 * 버린 것들이라 `build-wide-dict.ts` 가 JMdict 에서 따로 뽑았다. 그래서 `--band=4` 로도
 * 안 잡힌다. **캐시는 같이 쓰고 산출물은 가른다** — id 가 같은 JMdict 엔트리 번호라
 * 캐시에서는 안 겹치고, 산출물을 갈라야 `--wide` 없이 돌렸을 때 서로를 안 지운다.
 */
const WIDE = join(import.meta.dirname, '..', 'public', 'dict', 'wide.json')
const wide: Target[] =
  process.argv.includes('--wide') && existsSync(WIDE)
    ? (JSON.parse(readFileSync(WIDE, 'utf8')) as { idioms: Target[] }).idioms
    : []

const baseTargets: Target[] = idioms.filter(
  (it) => bandOf(it) <= MAX_BAND && it.glossEn.length > 0,
)
const wideTargets: Target[] = wide.filter((it) => it.glossEn.length > 0)
const targets: Target[] = [...baseTargets, ...wideTargets]

const cache: Record<string, Entry> = existsSync(CACHE)
  ? (JSON.parse(readFileSync(CACHE, 'utf8')) as Record<string, Entry>)
  : {}

const flush = () => writeFileSync(CACHE, JSON.stringify(cache))
process.on('SIGINT', () => {
  flush()
  console.log('\n중단 — 캐시 저장. 다시 실행하면 이어서 한다.')
  process.exit(130)
})

const todo = targets.filter((it) => !cache[it.id]).slice(0, LIMIT)
console.log(
  `대상 ${targets.length}개 (밴드 0~${MAX_BAND}${wide.length > 0 ? ` + 넓힌 사전 ${wide.length}` : ''}) · 캐시 ${Object.keys(cache).length} · 이번에 ${todo.length}개 · 모델 ${MODEL}`,
)

const t0 = Date.now()
let done = 0
for (const it of todo) {
  try {
    const ko = await translateGloss(MODEL, {
      headword: it.headword,
      reading: it.reading,
      glossEn: it.glossEn,
    })
    cache[it.id] = { ko, glossEn: it.glossEn, model: MODEL, flags: qualityFlags(ko, it.glossEn) }
  } catch (e) {
    // 실패는 flag 로 남기고 계속 — 워크리스트가 잡는다
    console.warn(`  ✗ ${it.headword}: ${e instanceof Error ? e.message.slice(0, 60) : e}`)
    cache[it.id] = { ko: '', glossEn: it.glossEn, model: MODEL, flags: ['error'] }
  }
  if (++done % 50 === 0) {
    flush()
    const rate = (Date.now() - t0) / done
    const left = (((todo.length - done) * rate) / 60000).toFixed(0)
    console.log(`  ${done}/${todo.length}  (${(rate | 0)}ms/건, 남은 시간 ~${left}분)`)
  }
}
flush()

// 캐시 → 산출물 (대상만, 플래그 집계 포함)
const flagCount: Record<string, number> = {}
const collect = (list: Target[]): Record<string, Entry> => {
  const out: Record<string, Entry> = {}
  for (const it of list) {
    const e = cache[it.id]
    if (!e) continue
    out[it.id] = e
    for (const fl of e.flags) flagCount[fl] = (flagCount[fl] ?? 0) + 1
  }
  return out
}
const meta = (byId: Record<string, Entry>) => ({
  source: 'JMdict_e 영어 gloss → 한국어 (Ollama)',
  model: MODEL,
  generatedAt: new Date().toISOString(),
  count: Object.keys(byId).length,
  flagged: Object.values(byId).filter((e) => e.flags.length > 0).length,
})

/**
 * **있던 것을 지우지 않는다** (2026-09-26). 전에는 산출물을 「이번 대상」으로 다시 만들어,
 * `--band=3` 으로 한 번 돌리면 밴드 4 몫 85,418개가 조용히 사라졌다 (실측 — `--wide` 를
 * 돌리다 기본값 3 으로 날렸다). 캐시가 원본이라 되살릴 수는 있지만, 되살릴 일이 없어야 한다.
 *
 * 그래서 기존 파일을 읽어 얹는다. 대상에서 빠진 옛 항목은 남지만, 그건 캐시에도 있는 것이라
 * 거짓이 아니다 — 지우는 쪽이 잃는 게 크다.
 */
const prev: Record<string, Entry> = existsSync(OUT)
  ? ((JSON.parse(readFileSync(OUT, 'utf8')) as { byId?: Record<string, Entry> }).byId ?? {})
  : {}
const byId = { ...prev, ...collect(baseTargets) }
writeFileSync(OUT, JSON.stringify({ _meta: meta(byId), byId }))

/**
 * 넓힌 사전 몫은 **파일을 갈라 쓴다** (2026-09-26).
 *
 * 한 파일에 같이 쓰면 다음에 `--wide` 없이 돌렸을 때 그 몫이 조용히 빠진다 —
 * 산출물을 「이번 대상」으로 다시 만들기 때문이다. 갈라 두면 서로를 안 지운다.
 */
if (wideTargets.length > 0) {
  const prevWide: Record<string, Entry> = existsSync(OUT_WIDE)
    ? ((JSON.parse(readFileSync(OUT_WIDE, 'utf8')) as { byId?: Record<string, Entry> }).byId ?? {})
    : {}
  const wideById = { ...prevWide, ...collect(wideTargets) }
  writeFileSync(OUT_WIDE, JSON.stringify({ _meta: meta(wideById), byId: wideById }))
  console.log(`→ ${OUT_WIDE}  (넓힌 사전 ${Object.keys(wideById).length}개)`)
}

console.log(`\n→ ${OUT}  (${Object.keys(byId).length}개, 플래그 있는 것 ${Object.values(byId).filter((e) => e.flags.length > 0).length})`)
for (const [fl, n] of Object.entries(flagCount).sort((a, b) => b[1] - a[1])) console.log(`   ${fl}: ${n}`)
