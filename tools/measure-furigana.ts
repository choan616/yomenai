// JmdictFurigana 를 두 번째 의견으로 삼아 decompose 의 경계를 전수 대조한다 (checklist Phase 12-B).
// JmdictFurigana 도 알고리즘 + 수작업 예외 목록이고 스스로 "not 100% accurate" 라 밝혔다.
// 불일치 = 우리가 틀렸다가 아니라 = 사람이 볼 자리다. 표면형(경계)까지만 본다 — 원형·음훈은 우리 몫.
// 산출물을 만들지 않는 일회성 실측 도구다 (measure-tatoeba.ts 와 같은 성격).
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf, type Band } from '../src/lib/bands.ts'
import { decompose, type KanjiReadings } from '../src/lib/onyomi.ts'
import { DICT_DIR, RAW_DIR, componentKanji, type IdiomRecord } from './lib/dict.ts'

interface FuriEntry {
  ruby: string
  rt?: string
}
interface FuriRecord {
  text: string
  reading: string
  furigana: FuriEntry[]
}

/** 읽기 문자열 안에서 경계가 떨어지는 오프셋들 (0 과 전체 길이는 제외한 내부 경계만) */
function interiorCuts(lens: number[]): Set<number> {
  const cuts = new Set<number>()
  let acc = 0
  for (let i = 0; i < lens.length - 1; i++) {
    acc += lens[i]
    cuts.add(acc)
  }
  return cuts
}

function sameSet(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}
/** a 의 모든 원소가 b 에 있는가 (b 가 a 보다 촘촘하거나 같은가) */
function subset(a: Set<number>, b: Set<number>): boolean {
  for (const x of a) if (!b.has(x)) return false
  return true
}

type Verdict = 'match' | 'our_finer' | 'conflict' | 'our_fail' | 'no_join' | 'jf_kana_run'

function main() {
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const { kanji } = JSON.parse(readFileSync(join(DICT_DIR, 'kanji.json'), 'utf8')) as {
    kanji: Record<string, KanjiReadings>
  }
  const lookup = (k: string) => kanji[k]

  // JmdictFurigana.json 은 UTF-8 BOM 이 붙어 있어 그대로 파싱하면 던진다
  const furiRaw = readFileSync(join(RAW_DIR, 'JmdictFurigana.json'), 'utf8').replace(/^﻿/, '')
  const furi = JSON.parse(furiRaw) as FuriRecord[]
  const furiIndex = new Map<string, FuriRecord>()
  for (const f of furi) {
    const key = f.text + '\t' + f.reading
    if (!furiIndex.has(key)) furiIndex.set(key, f)
  }
  console.log(`JmdictFurigana ${furi.length.toLocaleString()}개 · (표기,읽기) 키 ${furiIndex.size.toLocaleString()}개`)
  console.log(`우리 코퍼스 ${idioms.length.toLocaleString()}개\n`)

  // 5 = 5자 이상, 2 = 2자 이하 (1자 한자 표제어도 여기로)
  const clen = (n: number) => (n <= 2 ? 2 : n >= 5 ? 5 : n) as 2 | 3 | 4 | 5

  const emptyRow = () => ({
    total: 0, match: 0, our_finer: 0, conflict: 0, our_fail: 0, no_join: 0, jf_kana_run: 0,
  })
  const byBand: Record<Band, ReturnType<typeof emptyRow>> = {
    0: emptyRow(), 1: emptyRow(), 2: emptyRow(), 3: emptyRow(), 4: emptyRow(),
  }
  const byLen: Record<2 | 3 | 4 | 5, ReturnType<typeof emptyRow>> = {
    2: emptyRow(), 3: emptyRow(), 4: emptyRow(), 5: emptyRow(),
  }

  const conflicts: string[] = []
  const finers: string[] = []
  const jfResolvedWeFailed: string[] = []

  for (const it of idioms) {
    const band = bandOf(it)
    const comp = componentKanji(it.headword)
    const L = clen(comp.length)
    byBand[band].total++
    byLen[L].total++

    let verdict: Verdict

    const jf = furiIndex.get(it.headword + '\t' + it.reading)
    if (!jf) {
      verdict = 'no_join'
    } else {
      // JF 경계 — 각 엔트리가 읽기에서 차지하는 길이 (rt 없으면 kana 가 그대로 나온다)
      const jfLens = jf.furigana.map((e) => [...(e.rt ?? e.ruby)].length)
      const jfCoversKana = jf.furigana.some((e) => e.rt === undefined)
      const jfCuts = interiorCuts(jfLens)

      const d = decompose(it.headword, it.reading, lookup)
      if (!d.ok) {
        verdict = jfCoversKana ? 'jf_kana_run' : 'our_fail'
        if (verdict === 'our_fail') {
          jfResolvedWeFailed.push(
            `${it.headword}\t${it.reading}\t${d.reason}\tJF:${jf.furigana.map((e) => (e.rt ?? e.ruby)).join('|')}\tband${band}\t${it.id}`,
          )
        }
      } else if (jfCoversKana) {
        // 우리 코퍼스는 한자-only 라 여기 오면 JF 쪽이 특이 케이스 (가나 섞인 이표기 매칭 등)
        verdict = 'jf_kana_run'
      } else {
        const ourCuts = interiorCuts(d.segments.map((s) => [...s.surface].length))
        const jfSurf = jf.furigana.map((e) => e.rt ?? e.ruby).join('|')
        const ourSurf = d.segments.map((s) => s.surface).join('|')
        const line = `${it.headword}\t${it.reading}\t우리:${ourSurf}\tJF:${jfSurf}\tband${band}\t${comp.length}자\t${it.id}`
        if (sameSet(ourCuts, jfCuts)) {
          verdict = 'match'
        } else if (subset(jfCuts, ourCuts)) {
          verdict = 'our_finer'
          finers.push(line)
        } else {
          verdict = 'conflict'
          conflicts.push(line)
        }
      }
    }

    byBand[band][verdict]++
    byLen[L][verdict]++
  }

  const pct = (n: number, d: number) => (d === 0 ? '  —  ' : ((n / d) * 100).toFixed(2).padStart(5) + '%')

  const table = (rows: Record<string, ReturnType<typeof emptyRow>>, label: string) => {
    console.log(`\n=== ${label} ===`)
    console.log('구분   total   조인   조인율 | match   일치율(조인·분해OK·경계정의)  finer  conflict  our_fail  jf_kana')
    for (const [k, r] of Object.entries(rows)) {
      const joined = r.total - r.no_join
      const comparable = r.match + r.our_finer + r.conflict
      console.log(
        `${k.padEnd(5)} ${String(r.total).padStart(6)} ${String(joined).padStart(6)} ${pct(joined, r.total)} |` +
          ` ${String(r.match).padStart(6)} ${pct(r.match, comparable)}` +
          `   ${String(r.our_finer).padStart(5)}  ${String(r.conflict).padStart(6)}  ${String(r.our_fail).padStart(7)}  ${String(r.jf_kana_run).padStart(6)}`,
      )
    }
  }

  const tot = emptyRow()
  for (const r of Object.values(byBand)) {
    for (const key of Object.keys(tot) as (keyof typeof tot)[]) tot[key] += r[key]
  }
  table({ '전체': tot }, '합계')
  table(byBand as unknown as Record<string, ReturnType<typeof emptyRow>>, '밴드별')
  table(byLen as unknown as Record<string, ReturnType<typeof emptyRow>>, '글자수별 (5 = 5자 이상)')

  console.log(
    `\n조인된 것 중 분해 OK + 경계 정의됨 = ${tot.match + tot.our_finer + tot.conflict}개.` +
      ` 그중 완전 일치 ${tot.match} · JF 보다 촘촘 ${tot.our_finer} · 충돌 ${tot.conflict}.`,
  )
  console.log(`JF 는 풀었는데 우리가 분해 실패: ${tot.our_fail}개`)

  const dump = join(RAW_DIR, 'furigana-mismatch.tmp.tsv')
  writeFileSync(
    dump,
    '# CONFLICT (JF 가 우리가 안 자른 자리를 잘랐다 — 우리가 의심됨)\n' +
      conflicts.join('\n') +
      '\n\n# OUR_FINER (우리가 JF 보다 촘촘 — JF 가 熟字訓 을 안 쪼갠 경우가 많다)\n' +
      finers.join('\n') +
      '\n\n# JF_RESOLVED_WE_FAILED\n' +
      jfResolvedWeFailed.join('\n') +
      '\n',
  )
  console.log(`\n불일치 전량 → ${dump} (data/raw, 커밋 안 됨)`)
  console.log(`\n충돌 표본 (앞 30):`)
  for (const l of conflicts.slice(0, 30)) console.log('  ' + l)
}

main()
