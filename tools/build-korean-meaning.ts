// JMdict 영어 gloss → 한국어 뜻(gemma4:latest)을 코퍼스 밴드 0~3 전량에 대해 만든다.
// stdict 대조본을 대체한다 (checklist 12-D 방향 변경, context-notes 2026-09-07).
// .korean-meaning-cache.json 로 중단 지점 재개. 산출물 data/dict/korean-meaning.json 은 gitignore.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { qualityFlags, translateGloss } from './lib/translate-gloss.ts'

const OUT = join(DICT_DIR, 'korean-meaning.json')
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
const targets = idioms.filter((it) => bandOf(it) <= MAX_BAND && it.glossEn.length > 0)

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
  `대상 ${targets.length}개 (밴드 0~${MAX_BAND}) · 캐시 ${Object.keys(cache).length} · 이번에 ${todo.length}개 · 모델 ${MODEL}`,
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
    cache[it.id] = {
      ko: '',
      glossEn: it.glossEn,
      model: MODEL,
      flags: ['error', e instanceof Error ? e.message.slice(0, 40) : 'unknown'],
    }
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
const byId: Record<string, Entry> = {}
const flagCount: Record<string, number> = {}
for (const it of targets) {
  const e = cache[it.id]
  if (!e) continue
  byId[it.id] = e
  for (const fl of e.flags) flagCount[fl] = (flagCount[fl] ?? 0) + 1
}
writeFileSync(
  OUT,
  JSON.stringify({
    _meta: {
      source: 'JMdict_e 영어 gloss → 한국어 (Ollama)',
      model: MODEL,
      generatedAt: new Date().toISOString(),
      count: Object.keys(byId).length,
      flagged: Object.values(byId).filter((e) => e.flags.length > 0).length,
    },
    byId,
  }),
)

console.log(`\n→ ${OUT}  (${Object.keys(byId).length}개, 플래그 있는 것 ${Object.values(byId).filter((e) => e.flags.length > 0).length})`)
for (const [fl, n] of Object.entries(flagCount).sort((a, b) => b[1] - a[1])) console.log(`   ${fl}: ${n}`)
