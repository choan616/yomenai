// 사람이 이미 「맞다」로 판정한 한국어 뜻에 모델을 돌려 「틀렸다」고 지목하는 비율(오탐률)을 잰다.
// 판정 모델을 뜻 초벌에 쓸 수 있는지 거르는 관문 — 오탐이 잦으면 사람 일을 줄이기는커녕 늘린다.
// 검수 표본 1,291건이 전부 o/s 라 잡아낼 오류가 없다. 그래서 여기서 재는 것은 재현율이 아니라
// 오탐률 하나다 (context-notes 2026-09-19 절).
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR } from './lib/dict.ts'
import { readTsv, writeTsvBom } from './lib/tsv.ts'

const HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const DEFAULT_MODEL = 'qwen3.5:latest'

/** 검수 TSV 한 줄에서 판정에 필요한 것만 추린 것 */
export interface JudgeRow {
  id: string
  headword: string
  reading: string
  glossEn: string
  koMeaning: string
  /** 사람 판정 — o(맞다) / s(stdict 정의 채택) */
  verdict: string
  file: string
}

/**
 * 사람 검수자가 본 것과 같은 질문을 낸다 — "이 한 줄이 영어 뜻을 맞게 옮겼나".
 * 정답(사람 판정)은 주지 않는다. Jev 의 Noul(예/아니오)과 같은 모양이라 나중에 같은 잣대로 비교된다
 */
export function buildPrompt(row: JudgeRow): string {
  return [
    `일본어 한자 숙어: ${row.headword} (${row.reading})`,
    `영어 뜻: ${row.glossEn}`,
    `한국어 뜻 한 줄: ${row.koMeaning}`,
    '',
    '이 한국어 한 줄이 위 영어 뜻을 맞게, 어색하지 않게 옮겼는가?',
    '- ok true: 뜻이 맞다. 표현이 조금 다르거나 더 짧아도 뜻이 통하면 true 다.',
    '- ok false: 뜻이 틀렸거나, 영어 뜻에 없는 내용을 지어냈거나, 한국어로 말이 안 된다.',
    'reason 은 반드시 고른 ok 와 일치하는 근거여야 한다.',
    '아래 JSON만 출력한다: {"ok": true 또는 false, "reason": "한 줄 근거(한국어)"}',
  ].join('\n')
}

/** 모델 응답에서 ok 를 뽑는다. true/false 가 아니면 null — 파싱 실패와 판정을 섞지 않는다 */
export function parseVerdict(raw: string): { ok: boolean; reason: string } | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const obj = parsed as { ok?: unknown; reason?: unknown }
  if (typeof obj.ok !== 'boolean') return null
  return { ok: obj.ok, reason: String(obj.reason ?? '').replace(/\s+/g, ' ').trim() }
}

/** 검수 TSV 전부에서 사람 판정이 붙은 행을 모은다 */
export function collectJudged(files: { name: string; grid: string[][] }[]): JudgeRow[] {
  const out: JudgeRow[] = []
  for (const { name, grid } of files) {
    const header = grid[0]
    const col = Object.fromEntries(header.map((h, i) => [h.replace(/^﻿/, ''), i]))
    for (const r of grid.slice(1)) {
      const verdict = (r[col.verdict] ?? '').trim()
      if (verdict === '' || verdict === '?') continue
      const koMeaning = verdict === 's' ? (r[col.stdict_def] ?? '') : (r[col.llm_ko] ?? '')
      if (!r[col.id] || !koMeaning) continue
      out.push({
        id: r[col.id],
        headword: r[col.headword] ?? '',
        reading: r[col.reading] ?? '',
        glossEn: r[col.glossEn] ?? '',
        koMeaning,
        verdict,
        file: name,
      })
    }
  }
  return out
}

async function ask(model: string, row: JudgeRow): Promise<{ ok: boolean; reason: string } | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${HOST}/api/generate`, {
        method: 'POST',
        body: JSON.stringify({
          model,
          prompt: buildPrompt(row),
          stream: false,
          think: false,
          format: 'json',
          options: { temperature: 0 },
        }),
      })
      if (!res.ok) continue
      const data = (await res.json()) as { response?: string }
      const parsed = parseVerdict(data.response ?? '')
      if (parsed) return parsed
    } catch {
      // 재시도
    }
  }
  return null
}

async function main() {
  const args = process.argv.slice(2)
  const model = args.find((a) => a.startsWith('--model='))?.slice(8) ?? DEFAULT_MODEL
  const limit = Number(args.find((a) => a.startsWith('--limit='))?.slice(8) ?? 0)

  const names = readdirSync(DICT_DIR).filter((f) => /^korean-meaning-worklist.*\.tsv$/.test(f)).sort()
  const rows = collectJudged(names.map((name) => ({ name, grid: readTsv(join(DICT_DIR, name)) })))
  const targets = limit > 0 ? rows.slice(0, limit) : rows
  console.log(`사람 판정 ${rows.length}건 중 ${targets.length}건에 ${model} 판정을 돌린다`)

  const flagged: string[][] = []
  let asked = 0
  let failed = 0
  const byVerdict: Record<string, { n: number; no: number }> = {}
  const started = Date.now()
  for (const row of targets) {
    const got = await ask(model, row)
    asked++
    const stat = (byVerdict[row.verdict] ??= { n: 0, no: 0 })
    stat.n++
    if (!got) {
      failed++
      continue
    }
    if (!got.ok) {
      stat.no++
      flagged.push([row.headword, row.reading, row.koMeaning, row.verdict, got.reason, row.glossEn, row.id])
    }
    if (asked % 50 === 0) {
      const perSec = asked / ((Date.now() - started) / 1000)
      console.log(`  ${asked}/${targets.length} — 지목 ${flagged.length} (${perSec.toFixed(1)}건/초)`)
    }
  }

  const out = join(DICT_DIR, `meaning-judge-${model.replace(/[:/]/g, '-')}.tsv`)
  writeTsvBom(
    out,
    [['headword', 'reading', 'koMeaning', 'human', 'model_reason', 'glossEn', 'id'], ...flagged]
      .map((r) => r.join('\t'))
      .join('\n'),
  )
  const o = byVerdict.o ?? { n: 0, no: 0 }
  console.log(`\n== ${model} ==`)
  console.log(`사람 o ${o.n}건 중 「틀렸다」 지목 ${o.no}건 — 오탐률 ${((o.no / o.n) * 100).toFixed(1)}%`)
  for (const [v, s] of Object.entries(byVerdict)) {
    if (v !== 'o') console.log(`사람 ${v} ${s.n}건 중 지목 ${s.no}건`)
  }
  if (failed) console.log(`응답 파싱 실패 ${failed}건 (지목에서 제외)`)
  console.log(`지목 목록 → ${out}`)
}

if (import.meta.filename === process.argv[1]) await main()
