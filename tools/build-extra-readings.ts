// JMdict 원본에서 「임포트가 떨어뜨린 다른 읽기」를 뽑아 data/dict/extra-readings.json 으로 굳히는 빌드 스크립트
//
// 임포트(`import-jmdict.ts`)는 한 항목에서 읽기를 **하나만** 고른다(`rEles.find(...) ?? rEles[0]`).
// JMdict 는 한 항목에 읽기 여럿과 읽기별 뜻(`stagr`)을 담는데, 그래서 逆手 의 `ぎゃくて`(foul trick)가
// 통째로 사라져 있었다. 임포트부터 다시 돌리면 밴드·한국어 분류·음독 분해가 전부 이 id 를 키로 쌓여 있어
// 파이프라인 전체가 흔들리므로, 임포트는 건드리지 않고 **빠진 읽기만 따로 뽑는다**.
//
// 결과는 항목마다 둘로 갈린다 (context-notes 2026-10-02 「읽기마다 뜻이 다른 말을 읽기 둘 항목으로」).
//   plain — 뜻이 같은 읽기. 채점이 정답으로만 받는다 (`altReadings`)
//   split — 그 읽기 **자신에게 걸린 뜻**이 있는 읽기. 별도 항목으로 올릴 후보다
// 읽기 표시(`re_inf`: 고어·비정상 등)가 붙은 읽기와 가타카나 읽기는 둘 다 뺀다 — 고어·희귀 읽기를 사전에
// 안 넣기로 한 앞 결정(2026-10-02)을 지킨다.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { DICT_DIR, findRawFile, type IdiomRecord } from './lib/dict.ts'

type El = Record<string, unknown>
const asArray = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const text = (v: unknown): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : String((v as El)?.['#text'] ?? '')

/** 형제 항목 후보. 뜻이 읽기별로 갈린 읽기다 */
export interface SplitReading {
  reading: string
  /**
   * **그 읽기 자신의** `re_pri` 만. 밴드는 이걸로 `bandOf` 가 정한다.
   *
   * `ke_pri`(표기)를 합치지 않는다 — `nf` 순위는 쓰인 표기의 빈도라 대표 읽기가 대부분을 차지하고,
   * 합치면 모든 읽기가 그 순위를 공짜로 물려받는다. 실측: 형제 후보 217개 중 자기 우선순위가 있는 읽기는
   * 10개뿐이었고, 합친 쪽으로는 平日 `ひらび`(부수 日 의 이름)가 밴드 0 으로 들어왔다.
   * 없으면 밴드 4(빈도 순위 없음)다
   */
  readingPriority: string[]
  /** 이 읽기에 적용되는 뜻들 — 한 뜻 안의 영어 뜻 목록. 공통 뜻과 이 읽기 전용 뜻이 섞여 있다 */
  senses: string[][]
  /** `senses` 중 **이 읽기에만 걸린** 뜻의 위치. 비어 있지 않아야 split 이다 */
  own: number[]
}

export interface Extras {
  /** 뜻이 같아 채점만 받아주는 읽기 */
  plain: string[]
  split: SplitReading[]
  /** 대표 읽기에 적용되는 뜻들. 분할된 부모의 뜻을 다시 볼 때 쓴다 (split 이 있을 때만) */
  parentSenses?: string[][]
}

export interface ExtractStats {
  /** 읽기 표시가 붙어 뺀 읽기 */
  tagged: number
  /** 가타카나 읽기라 뺀 읽기 */
  katakana: number
  /** 한자 없이 쓰는 읽기(`re_nokanji`)라 뺀 읽기 */
  nokanji: number
  /** 다른 표기에만 걸린 읽기(`re_restr`)라 뺀 읽기 */
  otherSpelling: number
  /** 대표 읽기나 먼저 받은 읽기와 발음이 같은 표기 변이(ぢ/づ)라 뺀 읽기 */
  sameSound: number
}

const HIRAGANA = /^[ぁ-ゖー]+$/u

/**
 * 뜻 단위의 고어(`arch`)·폐어(`obs`) 표시. 읽기 전용 뜻이 전부 이런 뜻이면 그 읽기는 낡은 읽기라 별도
 * 항목으로 올리지 않는다 — 고어·희귀 읽기를 사전에 안 넣는다는 앞 결정(2026-10-02)을 기계로 확인
 * 가능한 범위까지 지킨다. `dated`(낡은 말)·`rare` 는 거르지 않는다: 소설에는 낡은 말이 나온다
 */
const ARCHAIC = new Set(['arch', 'obs'])
// <misc>&arch;</misc> → "arch" (import-jmdict 의 posCode 와 같은 처리)
const miscCode = (v: unknown): string => text(v).replace(/[^A-Za-z0-9-]/g, '')

/**
 * 발음이 같은 표기 변이를 같게 접는다 — 현대 일본어에서 ぢ/づ 는 じ/ず 와 같은 소리다(四つ仮名).
 * 連中 의 `れんじゅう`·`れんぢゅう` 가 별개 읽기로 들어오면 로마자가 같아 id 가 겹치고, 무엇보다
 * 학습자에게는 같은 읽기다. 접은 값이 같으면 하나로 본다 (실제 데이터가 이 충돌을 빌드에서 잡아 줬다)
 */
export const foldYotsugana = (reading: string): string => reading.replace(/ぢ/g, 'じ').replace(/づ/g, 'ず')

/**
 * 한 항목에서 대표 읽기 말고 받을 읽기를 뽑는다. XML 을 안 읽는 순수 함수라 테스트가 된다.
 *
 * @param entry   `fast-xml-parser` 가 만든 `<entry>`
 * @param headword 이 id 로 임포트된 표기
 * @param primary  임포트가 고른 대표 읽기
 */
export function extractExtras(
  entry: El,
  headword: string,
  primary: string,
  stats?: ExtractStats,
): Extras {
  const senses = asArray(entry.sense as El | El[] | undefined).map((s) => ({
    stagk: asArray(s.stagk as string | string[] | undefined).map(text),
    stagr: asArray(s.stagr as string | string[] | undefined).map(text),
    gloss: asArray(s.gloss as unknown | unknown[]).map(text).filter(Boolean),
    archaic: asArray(s.misc as unknown | unknown[]).map(miscCode).some((m) => ARCHAIC.has(m)),
  }))
  // 이 표기에 쓰이는 뜻만. `stagk` 는 다른 표기에만 걸린 뜻을 거른다
  const forSpelling = senses.filter((s) => s.stagk.length === 0 || s.stagk.includes(headword))
  const appliesTo = (reading: string) =>
    forSpelling.filter((s) => s.stagr.length === 0 || s.stagr.includes(reading))

  const extras: Extras = { plain: [], split: [] }
  /** 받은 읽기를 소리로 접은 값 — 대표 읽기가 먼저 들어 있다 */
  const heardAs = new Set([foldYotsugana(primary)])
  for (const r of asArray(entry.r_ele as El | El[] | undefined)) {
    const reading = text(r.reb)
    if (reading === primary) continue
    if (r.re_nokanji !== undefined) {
      if (stats) stats.nokanji++
      continue
    }
    const restr = asArray(r.re_restr as string | string[] | undefined).map(text)
    if (restr.length > 0 && !restr.includes(headword)) {
      if (stats) stats.otherSpelling++
      continue
    }
    if (asArray(r.re_inf as string | string[] | undefined).length > 0) {
      if (stats) stats.tagged++
      continue
    }
    if (!HIRAGANA.test(reading)) {
      if (stats) stats.katakana++
      continue
    }
    if (heardAs.has(foldYotsugana(reading))) {
      if (stats) stats.sameSound++
      continue
    }
    heardAs.add(foldYotsugana(reading))

    const mine = appliesTo(reading)
    // 이 읽기에만 걸린 뜻 — 공통 뜻(stagr 없음)은 대표 읽기와 같으므로 뜻이 갈렸다는 증거가 못 된다.
    // 그 뜻이 고어·폐어면 증거로 안 친다 (위 ARCHAIC)
    const own = mine.flatMap((s, i) => (s.stagr.includes(reading) && !s.archaic ? [i] : []))
    if (own.length === 0) {
      extras.plain.push(reading)
      continue
    }
    extras.split.push({
      reading,
      readingPriority: asArray(r.re_pri as string | string[] | undefined).map(text),
      senses: mine.map((s) => s.gloss),
      own,
    })
  }
  if (extras.split.length > 0) extras.parentSenses = appliesTo(primary).map((s) => s.gloss)
  return extras
}

function main() {
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const byId = new Map(idioms.map((i) => [i.id, i]))

  const xml = gunzipSync(readFileSync(findRawFile('JMdict_e', '.gz')))
    .toString('utf8')
    // 내부 DTD subset 제거 — 엔티티를 확장하지 않고 코드로 보존한다 (import-jmdict 와 같은 처리)
    .replace(/<!DOCTYPE[^[]*\[[\s\S]*?\]>/, '')
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) =>
      [
        'entry', 'k_ele', 'r_ele', 'sense', 'gloss', 'ke_pri', 're_pri', 're_restr', 're_inf', 'stagk', 'stagr', 'misc',
      ].includes(name),
  })
  const entries = (parser.parse(xml) as { JMdict: { entry: El[] } }).JMdict.entry

  const stats: ExtractStats = { tagged: 0, katakana: 0, nokanji: 0, otherSpelling: 0, sameSound: 0 }
  const byIdOut: Record<string, Extras> = {}
  let withPlain = 0
  let withSplit = 0
  for (const entry of entries) {
    const id = String(text(entry.ent_seq))
    const idiom = byId.get(id)
    if (!idiom) continue
    const ex = extractExtras(entry, idiom.headword, idiom.reading, stats)
    if (ex.plain.length === 0 && ex.split.length === 0) continue
    byIdOut[id] = ex
    if (ex.plain.length > 0) withPlain++
    if (ex.split.length > 0) withSplit++
  }

  const out = {
    _meta: {
      source: 'JMdict_e (EDRDG)',
      license: 'CC BY-SA 4.0',
      rule: '읽기 표시·가타카나·한자 없는 읽기·다른 표기 전용 읽기는 뺐다. split = 그 읽기 자신에게 걸린 뜻(stagr)이 있는 읽기',
      generatedAt: new Date().toISOString(),
    },
    byId: byIdOut,
  }
  const outPath = join(DICT_DIR, 'extra-readings.json')
  writeFileSync(outPath, JSON.stringify(out))
  const splits = Object.values(byIdOut).reduce((n, e) => n + e.split.length, 0)
  const plains = Object.values(byIdOut).reduce((n, e) => n + e.plain.length, 0)
  console.log(`JMdict ${entries.length}개 항목 중 학습 사전 ${idioms.length}개를 대조`)
  console.log(`  못 받던 읽기가 있는 항목 ${Object.keys(byIdOut).length}개`)
  console.log(`    채점만 받아줄 읽기(plain) ${plains}개 — ${withPlain}개 항목`)
  console.log(`    별도 항목 후보(split)     ${splits}개 — ${withSplit}개 항목`)
  console.log(
    `  뺀 읽기 — 읽기 표시 ${stats.tagged} · 가타카나 ${stats.katakana} · ` +
      `한자 없는 읽기 ${stats.nokanji} · 다른 표기 전용 ${stats.otherSpelling} · 같은 소리(ぢ/づ) ${stats.sameSound}`,
  )
  console.log(`  → ${outPath}`)
  if (!existsSync(outPath)) process.exit(1)
}

if (import.meta.filename === process.argv[1]) main()
