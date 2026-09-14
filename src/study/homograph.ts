// 동형이독(같은 표기, 다른 읽기) 처리 — 이어 묻기가 상대 숙어를 찾는 곳 (2026-09-14)
import { isCorrectReading } from '../core/session.ts'

/** 표기와 읽기만 있으면 된다 — 사전 레코드 전체를 요구하지 않으려고 좁게 받는다 */
export interface HomographCandidate {
  idiomId: string
  headword: string
  reading: string
}

/**
 * 방금 쓴 답이 **같은 표기의 다른 숙어**의 읽기라면 그 숙어를 돌려준다.
 *
 * 市場 しじょう 카드에 いちば 라고 쓴 경우가 이것이다. 둘은 처음부터 별도 숙어라
 * (`1308305` / `1308300`) 새 카드 종류를 만들 필요가 없다 — 이어 묻기는 "이미 있는
 * 상대 카드를 지금 꺼낼까" 의 문제다.
 *
 * 못 찾으면 `undefined`. 상대 숙어가 지금 풀에 없을 때가 그렇다 — 사전의
 * `altReadings` 는 밴드 4 까지 합쳐 계산하므로 밴드 0~3 만 켠 사용자에게는
 * 채점만 통과하고 물어볼 카드는 없는 읽기가 있다. 그때는 한 줄 안내로 끝낸다.
 */
export function siblingFor(
  idiom: { idiomId: string; headword: string },
  answer: string,
  sameHeadword: HomographCandidate[] | undefined,
): HomographCandidate | undefined {
  return (sameHeadword ?? []).find(
    (x) => x.idiomId !== idiom.idiomId && isCorrectReading(x.reading, answer),
  )
}
