// 학습 풀을 **한 군데서** 만든다 (2026-09-26)
//
// 세션은 base + 담아 둔 밴드 4 + 넓힌 사전에서 들인 것을 본다. 그런데 음독맵과 리포트는
// `base.json` 만 보고 있었다. 그래서 **담은 밴드 4 를 공부해도 그 두 화면에는 안 잡혔다** —
// 채점은 쌓이는데 분모에는 없는 상태였다. 넓힌 사전에서 들인 말도 같은 구멍에 빠진다.
//
// 「두 자리에서 따로 세면 언젠가 갈라진다」는 경고가 두 화면 주석에 이미 적혀 있었는데,
// 정작 풀 자체가 갈려 있었다. 조립을 여기로 모아 그 말이 실제로 지켜지게 한다.
import { studyPool, loadBand4Idioms, loadBaseIdioms, type KanjiInfo, type OnyomiPair, type RuntimeIdiom } from './load.ts'
import { adopt, loadWideDict, withWideKanji } from './wide.ts'
import { parsePairId } from '../lib/onyomi.ts'

export interface StudyPool {
  pool: RuntimeIdiom[]
  /**
   * 넓힌 사전에서 들인 글자까지 합친 한자 자료. 런타임 `kanji.json` 은 학습 사전에 나오는
   * 2,130자뿐이라 `轟` 이 없다 — 안 합치면 후리가나와 오답 분류가 조용히 안 붙는다
   */
  kanji: Map<string, KanjiInfo>
}

/**
 * 담은 것이 전부 기본 사전 안에 있으면 밴드 4(20MB)도 넓힌 사전(2.2MB)도 안 받는다.
 * 담기 전에는 아래 갈래가 돌 일이 없다.
 */
export async function loadStudyPool(opts: {
  starred: Iterable<string>
  includeKun: boolean
  /** 런타임 `kanji.json`. 넓힌 사전을 받으면 여기에 얹어 돌려준다 */
  kanji: Map<string, KanjiInfo>
}): Promise<StudyPool> {
  let pool = studyPool(await loadBaseIdioms(), opts.includeKun)
  let kanji = opts.kanji

  const have = new Set(pool.map((it) => it.idiomId))
  const want = new Set([...opts.starred].filter((id) => !have.has(id)))
  if (want.size === 0) return { pool, kanji }

  /**
   * **담아 둔 밴드 4 를 들인다** (2026-09-23 사용자 요청 「학습범위 밖 표현도 세션에
   * 추가할 수 없나」). 자동 출제는 안 한다 — 85,418개가 저절로 섞이면 밀도가 확 떨어진다
   */
  const band4 = studyPool(await loadBand4Idioms(), opts.includeKun).filter((it) =>
    want.has(it.idiomId),
  )
  if (band4.length > 0) pool = [...pool, ...band4]
  for (const it of band4) want.delete(it.idiomId)
  if (want.size === 0) return { pool, kanji }

  /**
   * **넓힌 사전에서 들인 것** (2026-09-25). 밴드 4에도 없으면 학습 사전 밖에서 담은 것이다.
   * 15,114개를 통째로 들이면 음독 쌍이 2,532 → 4,794 가 되고 그 절반이 상용 밖 글자라
   * 「숙지한 음독」이 재는 것이 달라진다 — 담은 것만 올리면 내가 넓힌 만큼만 는다
   */
  const dict = await loadWideDict().catch(() => null)
  if (dict === null) return { pool, kanji }
  // 한자 자료를 **먼저** 합친다. `轟` 이 lookup 에 없으면 분해부터 실패한다
  kanji = withWideKanji(kanji, dict)
  const look = (k: string) => {
    const r = kanji.get(k)
    return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
  }
  const adopted = [...want]
    .map((id) => dict.byId.get(id))
    .map((it) => (it ? adopt(it, look) : null))
    .filter((it) => it !== null)
  if (adopted.length > 0) pool = [...pool, ...studyPool(adopted, opts.includeKun)]
  return { pool, kanji }
}

/**
 * 풀에는 있는데 `pairs.json` 에 없는 쌍을 id 에서 되꺼내 채운다.
 *
 * 들인 말의 음독 쌍은 빌드 자산에 없다 — 런타임에 만들어진 것이다. 안 채우면
 * `pairRows` 가 그 줄을 버려서, 세션에선 나오고 채점도 되는데 음독맵에서만 사라진다.
 *
 * **`pairRows` 의 「사전에 없는 pairId 는 제외한다」 규칙은 안 건드린다.** 그건 자료가
 * 어긋났을 때의 방어선이라 그대로 두고, 아는 쪽이 완전한 Map 을 만들어 넘긴다.
 */
export function withRuntimePairs(
  pairs: Map<string, OnyomiPair>,
  pool: readonly RuntimeIdiom[],
): Map<string, OnyomiPair> {
  let out: Map<string, OnyomiPair> | null = null
  for (const it of pool) {
    for (const pid of it.pairIds) {
      if (pairs.has(pid) || out?.has(pid)) continue
      const p = parsePairId(pid)
      if (p === null) continue
      out ??= new Map(pairs)
      out.set(pid, p)
    }
  }
  return out ?? pairs
}
