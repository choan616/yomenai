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
  // "삭제"가 아니라 "지금 쓰는 음(now) / 옛·드문 음(old)" 로 가르는 제안이다.
  // 근거: KANJIDIC korean_h 는 한국 자전 기반이라 옛 음도 정식 음이다. stdict 표제어에
  // 나타나는지는 "현대 어휘에 쓰이는가" 이지 "맞는 음인가" 가 아니다.
  //   now = kanjidic 음 중 stdict 근거 있음(자전 순서 유지) + 강한 교정음(자전에 없는데 5+ hits)
  //   old = kanjidic 음 중 stdict 근거 0.  now 가 비면 전부 now 로 두고 old 는 비운다(판단 보류)
  const CORRECTION_MIN = 5
  const HEADER = ['char', 'now', 'old', 'corpusFreq', 'stdict_attested', 'samples']
  interface Row {
    hasOld: boolean
    thin: boolean
    cells: (string | number)[]
  }
  const out: Row[] = []
  const chars = [...corpusFreq.keys()]
    .filter((c) => (kanji[c].koreanH ?? []).length >= 2)
    .sort((a, b) => (corpusFreq.get(b) ?? 0) - (corpusFreq.get(a) ?? 0))
  for (const c of chars) {
    const kr = kanji[c].koreanH
    const att = attested.get(c) ?? new Map<string, number>()
    const attEntries = [...att.entries()].sort((a, b) => b[1] - a[1])
    const inKr = new Set(kr)
    let now = kr.filter((r) => initialLawForms(r).some((f) => att.has(f)))
    const old = kr.filter((r) => !now.includes(r))
    // 자전에 없는데 stdict 에서 강하게 나오는 음(斉→제 류)은 now 앞에 붙인다
    const correction = attEntries
      .filter(([s, n]) => !inKr.has(s) && n >= CORRECTION_MIN)
      .map(([s]) => s)
    now = [...correction, ...now]
    const thin = now.length === 0
    if (thin) now = [...kr] // 판단 보류 — 전부 now, old 비움
    out.push({
      hasOld: !thin && old.length > 0,
      thin,
      cells: [
        c,
        now.join('·'),
        thin ? '' : old.join('·'),
        corpusFreq.get(c) ?? 0,
        attEntries.map(([s, n]) => `${s}:${n}`).join(' ') || '—',
        (samples.get(c) ?? []).join(' / '),
      ],
    })
  }
  const toTsv = (rows: Row[]) =>
    [HEADER.join('\t'), ...rows.map((r) => r.cells.join('\t'))].join('\n') + '\n'

  const auditPath = join(DICT_DIR, 'korean-reading-audit.tsv')
  const reviewPath = join(DICT_DIR, 'korean-reading-review.tsv')
  writeFileSync(auditPath, toTsv(out))
  writeFileSync(reviewPath, toTsv(out.filter((r) => r.hasOld)))

  const withOld = out.filter((r) => r.hasOld).length
  const thin = out.filter((r) => r.thin).length
  console.log(`stdict 캐시 항목 ${usedEntries.toLocaleString()}개를 위치정렬에 사용`)
  console.log(`코퍼스 한자 중 kr 2개 이상: ${chars.length}자`)
  console.log(`  old(옛 음) 후보가 있는 한자        : ${withOld}자  → 검수 대상`)
  console.log(`  now/old 그대로 (all 근거 or 표본부족): ${chars.length - withOld}자 (그중 표본부족 ${thin}자)`)
  console.log(`→ ${auditPath} (전체 ${chars.length})`)
  console.log(`→ ${reviewPath} (old 후보 ${withOld}자만)`)
  console.log(`\n검수: now/old 두 열을 손보면 됨. old 로 내려도 삭제가 아니라 "옛 음" 으로 접힘.`)
}

main()
