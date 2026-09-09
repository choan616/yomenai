// KANJIDIC2 korean_h(한자별 한국음)를 stdict 사전 표제어로 교차검증하는 감사 스크립트.
// 오답 상세 화면이 보여주는 kr 목록 중 실제 한국어 사전에 근거가 없는(옛 음·코드포인트 오염)
// 후보를 가려낸다. 초벌일 뿐이라 최종 판단은 사람이 한다.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { loadVariantSets } from './lib/kanji-variants.ts'

const PUB_DIR = join(import.meta.dirname, '..', 'public', 'dict')

interface KanjiInfo {
  koreanH: string[]
}
interface BaseIdiom {
  headword: string
  reading: string
  band: number
  pairIds: string[]
}
interface StdictEntry {
  word?: string
  origin?: string
}

const HANGUL = /^[가-힣]+$/
const KANJI = /^[㐀-鿿豈-﫿]+$/

// 두음법칙 — KANJIDIC 은 원음(론·룡·녀)을, stdict 표제어는 표기형(논·용·여)을 쓴다.
// 한 음절의 원음이 낼 수 있는 어두 표기형까지 함께 만들어 대조한다.
const Y_MEDIAL = new Set([2, 3, 6, 7, 12, 17, 20]) // ㅑㅒㅕㅖㅛㅠㅣ
function initialLawForms(syllable: string): string[] {
  const code = syllable.charCodeAt(0) - 0xac00
  if (code < 0 || code >= 11172) return [syllable]
  const lead = Math.floor(code / 588)
  const rest = code % 588
  const medial = Math.floor(rest / 28)
  const withLead = (l: number) => String.fromCharCode(0xac00 + l * 588 + rest)
  const out = [syllable]
  if (lead === 5) out.push(Y_MEDIAL.has(medial) ? withLead(11) : withLead(2)) // ㄹ→ㅇ/ㄴ
  if (lead === 2 && Y_MEDIAL.has(medial)) out.push(withLead(11)) // ㄴ→ㅇ
  return out
}

function main() {
  const kanji = (
    JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
      kanji: Record<string, KanjiInfo>
    }
  ).kanji
  const base = (
    JSON.parse(readFileSync(join(PUB_DIR, 'base.json'), 'utf8')) as { idioms: BaseIdiom[] }
  ).idioms
  const cache = JSON.parse(
    readFileSync(join(DICT_DIR, '.korean-cache.json'), 'utf8'),
  ) as Record<string, StdictEntry[] | unknown>
  const variants = loadVariantSets()
  // KANJIDIC jis208 variant 표가 놓치는 신자체↔정자 (Phase 3 절 "税/稅, 戸/戶 …" 와 같은 결손).
  // stdict origin 은 정자를 쓰므로 안 이으면 근거를 0으로 오판한다
  for (const [a, b] of [
    ['内', '內'], ['呉', '吳'], ['税', '稅'], ['説', '說'], ['脱', '脫'], ['鋭', '銳'],
    ['戸', '戶'], ['歩', '步'], ['温', '溫'], ['担', '擔'], ['将', '將'], ['奨', '奬'],
  ] as const) {
    ;(variants.get(a) ?? variants.set(a, new Set()).get(a)!).add(b)
    ;(variants.get(b) ?? variants.set(b, new Set()).get(b)!).add(a)
  }

  // 학습 코퍼스(base)에 등장하는 한자별 빈도·예시
  const corpusFreq = new Map<string, number>()
  const samples = new Map<string, string[]>()
  for (const it of base) {
    for (const c of new Set([...it.headword].filter((c) => kanji[c]))) {
      corpusFreq.set(c, (corpusFreq.get(c) ?? 0) + 1)
      const s = samples.get(c) ?? samples.set(c, []).get(c)!
      if (s.length < 4) s.push(`${it.headword} ${it.reading}`)
    }
  }

  // 정자/이체자 → 코퍼스 한자. stdict origin 은 정자라 되돌려 맞춘다
  const originToCorpus = new Map<string, Set<string>>()
  for (const c of corpusFreq.keys()) {
    const add = (k: string) => (originToCorpus.get(k) ?? originToCorpus.set(k, new Set()).get(k)!).add(c)
    add(c)
    for (const v of variants.get(c) ?? []) add(v)
  }

  // stdict 표제어를 위치 정렬해 (한자, 음절) 근거를 모은다
  const attested = new Map<string, Map<string, number>>() // 코퍼스 한자 → (음절 → 등장수)
  let usedEntries = 0
  for (const v of Object.values(cache)) {
    if (!Array.isArray(v)) continue
    for (const e of v as StdictEntry[]) {
      if (!e.word || !e.origin) continue
      const w = [...e.word.replace(/[-^\s]/g, '')]
      const o = [...e.origin]
      if (o.length !== w.length || o.length === 0) continue
      if (!HANGUL.test(w.join('')) || !KANJI.test(o.join(''))) continue
      usedEntries++
      for (let i = 0; i < o.length; i++) {
        for (const c of originToCorpus.get(o[i]) ?? []) {
          const m = attested.get(c) ?? attested.set(c, new Map()).get(c)!
          m.set(w[i], (m.get(w[i]) ?? 0) + 1)
        }
      }
    }
  }

  // 리포트 — kr 2개 이상인 한자만, 코퍼스 빈도순.
  // verdict 열: keep(둘 다 근거), trim:xx(강한 노이즈 후보 — 주음 15+ hits, 나머지 0), ?(표본 부족)
  const STRONG_MIN = 15
  const rows: string[] = [
    ['char', 'verdict', 'corpusFreq', 'kanjidic_kr', 'stdict_attested', 'unconfirmed', 'samples'].join(
      '\t',
    ),
  ]
  let multi = 0
  const tally = { keep: 0, trim: 0, review: 0 }
  const chars = [...corpusFreq.keys()]
    .filter((c) => (kanji[c].koreanH ?? []).length >= 2)
    .sort((a, b) => (corpusFreq.get(b) ?? 0) - (corpusFreq.get(a) ?? 0))
  for (const c of chars) {
    multi++
    const kr = kanji[c].koreanH
    const att = attested.get(c) ?? new Map<string, number>()
    const attEntries = [...att.entries()].sort((a, b) => b[1] - a[1])
    const topCount = attEntries[0]?.[1] ?? 0
    const unconfirmed = kr.filter((r) => !initialLawForms(r).some((f) => att.has(f)))
    let verdict: string
    if (unconfirmed.length === 0) {
      verdict = 'keep'
      tally.keep++
    } else if (unconfirmed.length < kr.length && topCount >= STRONG_MIN) {
      verdict = `trim:${unconfirmed.join('·')}`
      tally.trim++
    } else {
      verdict = '?'
      tally.review++
    }
    rows.push(
      [
        c,
        verdict,
        corpusFreq.get(c) ?? 0,
        kr.join('·'),
        attEntries.map(([s, n]) => `${s}:${n}`).join(' ') || '—',
        unconfirmed.join('·') || '—',
        (samples.get(c) ?? []).join(' / '),
      ].join('\t'),
    )
  }

  const outPath = join(DICT_DIR, 'korean-reading-audit.tsv')
  writeFileSync(outPath, rows.join('\n') + '\n')

  console.log(`stdict 캐시 항목 ${usedEntries.toLocaleString()}개를 위치정렬에 사용`)
  console.log(`코퍼스 한자 중 kr 2개 이상: ${multi}자`)
  console.log(`  keep  (둘 다 stdict 근거 있음)         : ${tally.keep}자`)
  console.log(`  trim  (주음 ${STRONG_MIN}+ · 나머지 0 — 잘라낼 후보): ${tally.trim}자`)
  console.log(`  ?     (표본 부족 — 사람이 판단)          : ${tally.review}자`)
  console.log(`→ ${outPath}`)
  console.log(`\n검수: verdict 열을 확정(keep / trim:음·음 / drop 전체)한 뒤 다음 단계(apply)로.`)
}

main()
