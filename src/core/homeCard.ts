// 홈이 주 동작에 내미는 카드 한 장 — 고르기(pickHomeCard)와 그 표기를 세션 첫 장으로 당기기(leadWith)
import type { CardType } from './types.ts'

/** 고를 카드가 가진 최소 정보 — `SessionItem` 과 그 뒤 파이프라인 카드가 둘 다 들어온다 */
interface Card {
  idiomId: string
  cardType: CardType
  due: boolean
}

/**
 * 홈에 내밀 카드를 고른다 (2026-10-13). 조건 셋 —
 * **읽기 카드**여야 하고(뜻 카드는 묻는 게 달라 「읽을 수 있어요?」와 어긋난다),
 * **전에 한 번이라도 본 카드**여야 하고(`due`. 처음 보는 표현을 내밀면 「모르겠다」로 끝나
 * 유도가 거꾸로 돈다. 담아 둔 것·신규는 `due` 가 false 라 여기서 빠진다),
 * **오늘 채점한 표기가 아니어야** 한다.
 *
 * 마지막 조건은 사용자 보고로 들어왔다 (2026-10-13 「세션을 끝내고 같은 단어가 다시 나온다」).
 * 「읽기 둘」 카드는 쓰지 못한 쪽을 **무기록**으로 둔다(2026-09-14 — 아직 안 배운 카드로 남긴다).
 * 그 숙어의 기한은 세션 전 그대로라, 돌아온 홈에서 방금 본 표기가 다시 맨 앞에 선다.
 * 틀려서 10분 뒤 다시 기한이 되는 카드도 같은 자리에 선다.
 * **표기 기준**이라야 둘 다 걸린다 — 기록이 남은 건 같은 표기의 짝꿍 숙어 쪽이다.
 *
 * 넘긴(SKIP) 카드는 기록이 없어 여기 안 걸린다. 그건 따로 정할 일이다.
 *
 * 없으면 null — 그날 홈은 「세션 시작」 그대로다.
 */
export function pickHomeCard(
  cards: readonly Card[],
  headwordOf: (idiomId: string) => string | undefined,
  /** 오늘 채점한 표기 (카드 종류를 안 가린다 — 그 글자를 오늘 봤다는 뜻이다) */
  seenToday: ReadonlySet<string>,
): string | null {
  const found = cards.find(
    (c) => c.due && c.cardType === 'reading' && !seenToday.has(headwordOf(c.idiomId) ?? ''),
  )
  return found?.idiomId ?? null
}

/**
 * 그 표기의 읽기 카드를 맨 앞으로 당긴다. 홈이 내민 표기가 **실제 첫 장**이어야 유도가
 * 거짓이 안 된다.
 *
 * **표기로 찾는다** — `foldHomographs` 가 같은 표기의 읽기 카드를 한 장으로 접으면서
 * 대표가 다른 숙어 id 가 될 수 있다. 사용자가 본 것은 표기이므로 그쪽이 기준이다.
 * 못 찾으면 순서를 그대로 둔다 (소개로 돌려졌거나 다른 구성이 뽑힌 날).
 */
export function leadWith<T extends { idiomId: string; cardType: CardType }>(
  cards: readonly T[],
  headwordOf: (idiomId: string) => string | undefined,
  headword: string,
): T[] {
  const at = cards.findIndex(
    (c) => c.cardType === 'reading' && headwordOf(c.idiomId) === headword,
  )
  if (at <= 0) return [...cards]
  const next = [...cards]
  next.unshift(...next.splice(at, 1))
  return next
}
