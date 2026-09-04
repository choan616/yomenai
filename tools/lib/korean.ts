// 숙어 한자 구성으로 한국어(한자음) 후보를 만들고, stdict 응답에서 동형(同形) 여부를 판정하는 유틸
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const CJK = /[㐀-鿿豈-﫿]/

/** 段々 → 段段. 々 를 앞 글자로 치환한다 (KANJIDIC 문자가 아니므로 대조 전에 펼친다) */
export function expandRepetition(headword: string): string {
  const chars = [...headword]
  return chars
    .map((c, i) => (c === '々' && i > 0 ? chars[i - 1] : c))
    .join('')
}

export interface KanjiKo {
  koreanH?: string[]
}

/** 한자 1자의 한국 한자음. 없으면 이체자(정자)의 한자음으로 보강한다 (収→收 등) */
export function koReadings(
  kanji: string,
  dict: Record<string, KanjiKo>,
  variants: Map<string, Set<string>>,
): string[] {
  const direct = dict[kanji]?.koreanH ?? []
  if (direct.length > 0) return direct
  for (const v of variants.get(kanji) ?? []) {
    const alt = dict[v]?.koreanH ?? []
    if (alt.length > 0) return alt
  }
  return []
}

/**
 * 숙어 표제어의 한국어 한자음 후보(데카르트 곱). 구성 한자 중 하나라도 한자음이
 * 없으면 빈 배열을 돌려준다 — 후보 생성 실패로 기록해야 한다.
 * 조합 폭발을 막기 위해 조합 수가 limit 을 넘으면 각 한자의 첫 음만 쓴다.
 */
export function koreanCandidates(
  headword: string,
  dict: Record<string, KanjiKo>,
  variants: Map<string, Set<string>>,
  limit = 48,
): string[] {
  const chars = [...expandRepetition(headword)]
  const perChar = chars.map((c) => koReadings(c, dict, variants))
  if (perChar.some((r) => r.length === 0)) return []
  const combos = perChar.reduce((n, r) => n * r.length, 1)
  const pools = combos > limit ? perChar.map((r) => [r[0]]) : perChar
  let out = ['']
  for (const pool of pools) out = out.flatMap((p) => pool.map((k) => p + k))
  return [...new Set(out)]
}

/** stdict origin 문자열에서 한자만 남긴다 ("←汽車", "汽車/기차" → "汽車") */
export function normalizeOrigin(origin: string): string {
  return [...origin].filter((c) => CJK.test(c)).join('')
}

/**
 * stdict 표제어의 原語(정자)가 일본어 표제어와 같은 글자인지 — 위치별로
 * 동일하거나 신자체↔정자 이체 관계면 동형으로 본다.
 */
export function originMatches(
  headword: string,
  origin: string,
  variants: Map<string, Set<string>>,
): boolean {
  const h = [...expandRepetition(headword)]
  const o = [...normalizeOrigin(origin)]
  if (h.length === 0 || h.length !== o.length) return false
  return h.every((hc, i) => hc === o[i] || (variants.get(hc)?.has(o[i]) ?? false))
}

// ── 분류 ────────────────────────────────────────────────────────────────────

export type MatchCategory = 'JP_UNIQUE' | 'NEEDS_REVIEW'
export interface Classification {
  category: MatchCategory
  /** 검수 전 잠정 분류 — 1:동형동의 2:동형이의 3:일본고유 */
  tentativeCategory: 1 | 2 | 3
  /** stdict 原語(정자)가 표제어와 같은 글자인 항목이 하나라도 있는가 */
  hasOriginMatch: boolean
}

/**
 * 한국어 후보로 얻은 stdict 항목들로 숙어를 사전 분류한다.
 * - 항목이 하나도 없으면 → JP_UNIQUE (한국어에 같은 소리의 한자어 자체가 없음)
 * - 항목이 있으면 → NEEDS_REVIEW. 音만 겹치는 경우(手紙→收支)도 KO 간섭 위험이라 사람이 본다
 */
export function classify(
  items: StdictItem[],
  headword: string,
  variants: Map<string, Set<string>>,
): Classification {
  if (items.length === 0) {
    return { category: 'JP_UNIQUE', tentativeCategory: 3, hasOriginMatch: false }
  }
  const hasOriginMatch = items.some((it) => originMatches(headword, it.origin, variants))
  return { category: 'NEEDS_REVIEW', tentativeCategory: 2, hasOriginMatch }
}

// ── stdict 오픈 API 클라이언트 ───────────────────────────────────────────────

export interface StdictSense {
  definition?: string
  pos?: string
  type?: string
}
export interface StdictItem {
  word: string
  supNo: string
  origin: string
  senses: StdictSense[]
  link: string
}

/** 일 호출 한도 초과·키 오류 등 API가 페이로드로 돌려주는 오류. 배치를 멈추고 나중에 재개한다 */
export class StdictApiError extends Error {}

interface RawResponse {
  channel?: { item?: RawItem | RawItem[]; total?: string | number }
  error?: { error_code?: string; message?: string }
}
// stdict JSON: origin·pos 는 item 레벨, definition·link·type 은 sense 레벨
interface RawItem {
  word?: string
  sup_no?: string | number
  origin?: string
  pos?: string
  sense?: RawSense | RawSense[]
}
interface RawSense {
  definition?: string
  link?: string
  type?: string
}

const arr = <T,>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class StdictClient {
  private cache: Map<string, StdictItem[]>
  private dirty = 0

  constructor(
    private key: string,
    private opts: { cachePath: string; delayMs?: number; flushEvery?: number } = { cachePath: '' },
  ) {
    this.cache = new Map(
      opts.cachePath && existsSync(opts.cachePath)
        ? Object.entries(JSON.parse(readFileSync(opts.cachePath, 'utf8')) as Record<string, StdictItem[]>)
        : [],
    )
  }

  get cacheSize(): number {
    return this.cache.size
  }

  flush(): void {
    if (!this.opts.cachePath || this.dirty === 0) return
    writeFileSync(this.opts.cachePath, JSON.stringify(Object.fromEntries(this.cache)))
    this.dirty = 0
  }

  /** 한 검색어의 stdict 결과(정확 일치, 최대 100건). 디스크 캐시가 재개 지점이다 */
  async search(term: string): Promise<StdictItem[]> {
    const hit = this.cache.get(term)
    if (hit) return hit
    const items = await this.fetchWithRetry(term)
    this.cache.set(term, items)
    if (++this.dirty >= (this.opts.flushEvery ?? 200)) this.flush()
    await sleep(this.opts.delayMs ?? 50)
    return items
  }

  private async fetchWithRetry(term: string): Promise<StdictItem[]> {
    const url =
      'https://stdict.korean.go.kr/api/search.do?' +
      new URLSearchParams({ key: this.key, q: term, req_type: 'json', num: '100', method: 'exact' })
    let lastErr: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      if (attempt > 0) await sleep([0, 500, 1500, 4000][attempt])
      try {
        const res = await fetch(url)
        if (!res.ok) {
          lastErr = new Error(`HTTP ${res.status}`)
          continue
        }
        const body = await res.text()
        // 결과 없음이면 stdict 는 HTTP 200 + 빈 본문을 준다
        if (body.trim() === '') return []
        const data = JSON.parse(body) as RawResponse
        if (data.error) {
          throw new StdictApiError(
            `stdict API 오류 ${data.error.error_code ?? ''}: ${data.error.message ?? JSON.stringify(data.error)}`,
          )
        }
        return arr(data.channel?.item).map((it) => ({
          word: String(it.word ?? ''),
          supNo: String(it.sup_no ?? ''),
          origin: String(it.origin ?? ''),
          senses: arr(it.sense).map((s) => ({
            definition: s.definition,
            pos: String(it.pos ?? ''),
            type: s.type,
          })),
          link: arr(it.sense)[0]?.link ?? '',
        }))
      } catch (e) {
        if (e instanceof StdictApiError) throw e
        lastErr = e
      }
    }
    throw new Error(`stdict 요청 실패 (${term}): ${lastErr instanceof Error ? lastErr.message : lastErr}`)
  }
}
