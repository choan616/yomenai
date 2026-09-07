// 진입 진단 완료 플래그 — 한 번 마치면 다시 안 뜨게 한다. 결과 자체는 이벤트 로그에 있다
import type { LevelProfile } from '../core/level.ts'

const KEY = 'yomenai:diagnosticDone'

export function isDiagnosticDone(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function markDiagnosticDone(): void {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // 프라이빗 모드 등 — 저장 실패 시 다음 진입에서 다시 뜬다
  }
}

/**
 * 학습 기록 초기화와 함께 부른다. 안 지우면 기록이 비었는데도 진단을 다시 못 받는다 —
 * "처음부터 다시"가 목적인 동작이므로 플래그도 같이 처음으로 돌아가야 한다.
 */
export function clearDiagnosticDone(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 무시 — 못 지워도 다음 동작을 막지는 않는다
  }
}

/**
 * 진입 진단을 권해야 하는지.
 *
 * **플래그만으로는 부족하다.** localStorage 라 기기를 안 넘어가서, 동기화로 다른 기기의
 * 기록만 받아온 사용자는 플래그가 비어 있어 진단을 다시 권받는다. 그래서 이벤트 로그에서
 * 파생한 수준도 같이 본다 — 어느 밴드든 판정이 섰으면 진입 진단이 더 알려줄 게 없다.
 * 진단의 목적은 "읽기가 흔들리기 시작하는 첫 밴드 찾기"뿐이기 때문이다 (PLAN §6).
 *
 * 플래그를 안 없애고 남겨두는 이유는 반대쪽 때문이다. 적응형 진단은 3문항에서 끝날 수도
 * 있어(`bandVerdict`) 방금 마쳤는데도 `LEVEL_MIN_SEEN` 에 못 미쳐 판정이 안 설 수 있다.
 * 그때 플래그가 없으면 끝내자마자 다시 권하게 된다.
 *
 * 플래그를 안 읽고 인자로 받는 건 테스트 환경이 node 라 localStorage 가 없어서다.
 */
export function shouldOfferDiagnostic(done: boolean, level: LevelProfile): boolean {
  return !done && level.solidThrough === null && level.edge === null
}
