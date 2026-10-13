// 홈이 내밀 카드가 직전 계산에 있었나 — 면의 자리를 첫 렌더부터 잡으려는 힌트 (2026-10-13)
//
// 걷었던 단어장 칸의 `wordlistHint` 와 같은 관례다. 홈은 세로 중앙 정렬이라 면(98px)이 계산
// 뒤에 생기면 제목까지 그 절반만큼 밀린다 (`screen-cache.spec.ts` 가 막는 일).
// 표기 자체는 로그를 읽어야 알 수 있으니 **면의 자리만** 미리 잡고 표기는 숨겨 둔다.
//
// 기록이 없는 기기는 힌트도 없고 내밀 카드도 없어 양쪽이 맞는다. 기록이 처음 쌓이는 날 한 번
// 어긋나고(계산 뒤 면이 생긴다), 그 뒤로는 맞는다 — 걷은 단어장 칸이 받던 것과 같은 거래다
const KEY = 'yomenai:leadHint'

export function hasLeadHint(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setLeadHint(has: boolean): void {
  try {
    if (has) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* 프라이빗 모드 — 자리 잡기만 못 한다 */
  }
}
