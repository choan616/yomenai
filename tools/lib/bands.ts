// JMdict 우선순위 태그를 난이도 밴드 0~4로 매핑한다 (PLAN §4). Phase 2에서 검수·확정 예정인 잠정 규칙
import type { IdiomRecord } from './dict.ts'

export type Band = 0 | 1 | 2 | 3 | 4

// priority 배열(nf01~nf48, news1/2, ichi1/2, spec1/2, gai1/2) → 밴드
export function priorityToBand(priority: string[]): Band {
  if (priority.length === 0) return 4 // 태그 없음 = N1 초과, 선택 구간

  let nf: number | null = null
  for (const tag of priority) {
    const m = /^nf(\d{2})$/.exec(tag)
    if (m) {
      const n = Number(m[1])
      if (nf === null || n < nf) nf = n
    }
  }
  if (nf !== null) {
    if (nf <= 10) return 0 // nf01~nf10, N3 이하
    if (nf <= 20) return 1 // nf11~nf20, N2 대
    return 2 // nf21~nf48, N2~N1 경계
  }

  // nf 없이 상위 마커만 있는 경우
  const has = (t: string) => priority.includes(t)
  if (has('news1') || has('ichi1') || has('spec1') || has('gai1')) return 2
  if (has('news2') || has('ichi2') || has('spec2') || has('gai2')) return 3
  return 3 // 그 외 태그가 붙은 드문 경우는 주력 구간으로
}

export function bandOf(idiom: IdiomRecord): Band {
  return priorityToBand(idiom.priority)
}
