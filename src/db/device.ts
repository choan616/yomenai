// 기기 식별자 — 기기별 파일 분리 동기화의 키 (PLAN §5 원칙 3). localStorage 에 한 번만 만든다
const KEY = 'yomenai:deviceId'

export function getDeviceId(): string {
  let id: string | null = null
  try {
    id = localStorage.getItem(KEY)
    if (id === null) {
      id = crypto.randomUUID()
      localStorage.setItem(KEY, id)
    }
  } catch {
    // 프라이빗 모드 등 localStorage 불가 — 세션 한정 임시 id 로 진행한다
    id ??= crypto.randomUUID()
  }
  return id
}
