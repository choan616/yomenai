// 진입 진단 완료 플래그 — 한 번 마치면 다시 안 뜨게 한다. 결과 자체는 이벤트 로그에 있다
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
