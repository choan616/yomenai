// 읽기 오답 상세의 순수 뷰모델 — 음독 분해, 한국 한자음 대조, 같은 음독을 쓰는 다른 숙어 (PLAN §7)
import type { KanjiInfo, OnyomiPair, RuntimeIdiom } from '../dict/load.ts'
import type { KanjiReadings } from '../lib/onyomi.ts'
import { surfaceOfPair } from '../core/surface.ts'

export interface BreakdownPart {
  pairId: string
  kanji: string
  /** 이 숙어에서 이 한자가 쓴 음/훈독 (히라가나 대표형) */
  base: string
  kind: 'on' | 'kun'
  /** 한국 한자음 — 지금 쓰는 음 */
  kr: string[]
  /** 옛·드문 음 (있으면 "옛 음" 으로 접어서 보여준다) */
  krOld: string[]
}

/** 숙어의 pairIds 를 (한자, 음독) 조각으로 펼치고 각 한자의 한국 한자음을 병기한다 */
export function breakdown(
  idiom: Pick<RuntimeIdiom, 'pairIds'>,
  pairs: Map<string, OnyomiPair>,
  kanji: Map<string, KanjiInfo>,
): BreakdownPart[] {
  const out: BreakdownPart[] = []
  for (const pid of idiom.pairIds) {
    const p = pairs.get(pid)
    if (p === undefined) continue
    const k = kanji.get(p.kanji)
    out.push({
      pairId: pid,
      kanji: p.kanji,
      base: p.base,
      kind: p.kind,
      kr: k?.kr ?? [],
      krOld: k?.krOld ?? [],
    })
  }
  return out
}

export interface SharedIdiom {
  id: string
  headword: string
  reading: string
}

/** 같은 (한자, 음독) 쌍을 쓰는 다른 숙어 몇 개. 자기 자신은 제외한다 */
export function sharedIdioms(
  pairId: string,
  index: Map<string, RuntimeIdiom[]>,
  excludeId: string,
  limit = 5,
): SharedIdiom[] {
  const out: SharedIdiom[] = []
  for (const it of index.get(pairId) ?? []) {
    if (it.idiomId === excludeId) continue
    out.push({ id: it.idiomId, headword: it.headword, reading: it.reading })
    if (out.length >= limit) break
  }
  return out
}

/**
 * 같은 (한자, 음독) 쌍을 쓰는 숙어를 **표면형별로 갈라** 대조군을 만든다.
 *
 * 평평한 목록은 "같은 음독을 쓰는 것들"까지만 말한다. 규칙 오류(촉음·연탁·장음)를 고치려면
 * 규칙이 걸린 것과 안 걸린 것을 나란히 봐야 한다 — 発達 はっ ↔ 発言 はつ.
 * 한쪽만 반복해서 보면 "이 자리엔 항상 촉음"이라는 과잉일반화가 생긴다
 * (context-notes 2026-09-07).
 *
 * 반환은 최대 2군. **지금 틀린 숙어가 속한 군이 항상 먼저**고, 그 다음이 가장 큰 다른 군이다.
 */
export interface ContrastGroup {
  /** 이 군에서 그 한자가 실제로 낸 소리 */
  surface: string
  /** 원형 그대로인가 — 변형이 일어나지 않은 쪽 */
  plain: boolean
  /** 지금 틀린 숙어가 이 군에 있는가 */
  current: boolean
  idioms: SharedIdiom[]
  /** 이 표면형을 쓰는 숙어 총수 (`idioms` 는 잘린 목록) */
  total: number
}

/** 쌍 하나에 대해 훑어볼 숙어 상한. 흔한 음독은 100개를 넘어 분해 비용이 커진다 */
export const CONTRAST_SCAN_LIMIT = 40

export function contrastGroups(
  pairId: string,
  base: string,
  index: Map<string, RuntimeIdiom[]>,
  lookup: (kanji: string) => KanjiReadings | undefined,
  currentId: string,
  perGroup = 3,
): ContrastGroup[] {
  const all = index.get(pairId) ?? []
  // 지금 숙어는 상한에 밀려 빠지면 안 되므로 앞으로 당겨 훑는다
  const cur = all.filter((it) => it.idiomId === currentId)
  const scan = [...cur, ...all.filter((it) => it.idiomId !== currentId)].slice(
    0,
    CONTRAST_SCAN_LIMIT,
  )

  const groups = new Map<string, RuntimeIdiom[]>()
  for (const it of scan) {
    const surface = surfaceOfPair(it.headword, it.reading, pairId, lookup)
    if (surface === null) continue
    const g = groups.get(surface)
    if (g === undefined) groups.set(surface, [it])
    else g.push(it)
  }

  const out: ContrastGroup[] = [...groups].map(([surface, items]) => {
    const mine = items.filter((it) => it.idiomId === currentId)
    const rest = items.filter((it) => it.idiomId !== currentId)
    return {
      surface,
      plain: surface === base,
      current: mine.length > 0,
      total: items.length,
      idioms: [...mine, ...rest].slice(0, perGroup).map((it) => ({
        id: it.idiomId,
        headword: it.headword,
        reading: it.reading,
      })),
    }
  })

  out.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      b.total - a.total ||
      (a.surface < b.surface ? -1 : a.surface > b.surface ? 1 : 0),
  )
  return out.slice(0, 2)
}
