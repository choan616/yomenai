// 사전 밖(넓힌 사전) 표현의 뜻 검수 판정을 덮어쓰기 기록에 접는 순수 로직 (2026-10-01)
//
// 넓힌 사전 항목은 `korean-class.json` 에 없다 — 거기 넣으면 15,114개가 학습 사전의 분류·밴드·
// 진단 기준에 섞인다(context-notes 2026-09-25). 그래서 앱 판정이 갈 곳이 `korean-meaning-wide-
// review.json` 이고, `build-wide-dict.ts` 가 번역 초안 위에 얹는다.
//
// 규칙은 `apply-app-review.ts` 와 같은 결을 따른다.
//   o            → 초안 뜻 그대로 검증 완료 (source 는 초안의 것 · `llm`)
//   x + fix      → 고친 뜻, source `manual`
//   ~ · 취소 · 빈 칸 → 안 건드린다 (애매는 사람이 다시 본다, 취소는 다른 종류의 행동이다)
// **기본은 이미 기록된 항목을 안 덮는다.** `force` 면 값이 다른 것만 덮고 같은 값은 그대로 둔다.
export interface WideReviewEntry {
  definition: string
  source: 'llm' | 'manual'
  verified: true
}
export type WideReview = Record<string, WideReviewEntry>

export interface ExportRow {
  id: string
  /** 내보내기의 판정 글자. `o` `x` `~` `-`(취소) 또는 빈 칸 */
  verdict: string
  fix: string
}

export interface FoldStats {
  added: number
  kept: number
  overwritten: number
  /** 애매(~)·취소·빈 칸·고친 뜻 없는 x */
  untouched: number
  /** 학습 사전(`korean-class.json`)의 id — 다른 도구의 몫이다 */
  classOwned: number
  /** 넓힌 사전에도 없는 id */
  unknown: number
  /** 덮어쓴 항목의 옛값 → 새값 (로그용) */
  changes: { id: string; from: string; to: string }[]
}

export function foldWideReview(
  rows: readonly ExportRow[],
  /** 넓힌 사전의 번역 초안. id → 한국어 뜻 */
  draft: ReadonlyMap<string, string>,
  /** 학습 사전 id. 이 id 는 여기서 안 다룬다 */
  classIds: ReadonlySet<string>,
  prev: WideReview,
  force = false,
): { next: WideReview; stats: FoldStats } {
  const next: WideReview = { ...prev }
  const stats: FoldStats = {
    added: 0,
    kept: 0,
    overwritten: 0,
    untouched: 0,
    classOwned: 0,
    unknown: 0,
    changes: [],
  }

  for (const r of rows) {
    if (classIds.has(r.id)) {
      stats.classOwned++
      continue
    }
    const base = draft.get(r.id)
    if (base === undefined) {
      stats.unknown++
      continue
    }

    let entry: WideReviewEntry | null = null
    if (r.verdict === 'o') {
      // 이미 고친 뜻이 있으면 그걸 지킨다 — `o` 는 「초안이 맞다」일 뿐 뜻을 정하지 않는다
      entry = prev[r.id] ?? { definition: base, source: 'llm', verified: true }
    } else if (r.verdict === 'x' && r.fix.trim() !== '') {
      entry = { definition: r.fix.trim(), source: 'manual', verified: true }
    }
    if (entry === null) {
      stats.untouched++
      continue
    }

    const had = prev[r.id]
    if (had === undefined) {
      next[r.id] = entry
      stats.added++
    } else if (had.definition === entry.definition && had.source === entry.source) {
      stats.kept++
    } else if (force) {
      next[r.id] = entry
      stats.overwritten++
      stats.changes.push({ id: r.id, from: had.definition, to: entry.definition })
    } else {
      stats.kept++
    }
  }
  return { next, stats }
}
