// JMdict 우선순위 태그를 난이도 밴드 0~4로 매핑한다 (PLAN §4). Phase 2에서 nf/news 상관 실측 후 확정
import type { IdiomRecord } from './dict.ts'

export type Band = 0 | 1 | 2 | 3 | 4

// 실측 결과(Phase 2): news1 = nf01~nf24, news2 = nf25~nf48 으로 정확히 갈린다.
// nf 없이 news 태그만 있는 항목은 0건, nf 있고 news 없는 항목도 0건.
// 따라서 밴드 경계는 nf 번호 하나로 결정할 수 있고 news1/news2 태그는 참조하지 않는다.
export const BAND_NF_MAX: Record<0 | 1 | 2 | 3, number> = {
  0: 10, // nf01~nf10   news1 전반   N3 이하
  1: 20, // nf11~nf20   news1 중반   N2 대
  2: 24, // nf21~nf24   news1 끝     N2~N1 경계
  3: 48, // nf25~nf48   news2 구간   N1 대 (주력)
}

// priority 배열에서 가장 낮은(= 가장 흔한) nf 번호를 뽑는다. nf 태그가 없으면 null
export function minNf(priority: string[]): number | null {
  let nf: number | null = null
  for (const tag of priority) {
    const m = /^nf(\d{2})$/.exec(tag)
    if (m) {
      const n = Number(m[1])
      if (nf === null || n < nf) nf = n
    }
  }
  return nf
}

// 밴드는 오직 nf 빈도 순위로만 결정한다.
// ichi1/spec1/gai1 만 있고 nf 가 없는 항목(1,096개)은 빈도 순위 자체가 없으므로 밴드 4다.
// 이들은 IdiomRecord.common === true 로 여전히 식별되므로 정보 손실은 없다 (context-notes 참조).
export function priorityToBand(priority: string[]): Band {
  const nf = minNf(priority)
  if (nf === null) return 4
  if (nf <= BAND_NF_MAX[0]) return 0
  if (nf <= BAND_NF_MAX[1]) return 1
  if (nf <= BAND_NF_MAX[2]) return 2
  if (nf <= BAND_NF_MAX[3]) return 3
  return 4
}

export function bandOf(idiom: IdiomRecord): Band {
  return priorityToBand(idiom.priority)
}

export const BAND_LABEL: Record<Band, string> = {
  0: 'nf01~10  news1 전반  N3 이하',
  1: 'nf11~20  news1 중반  N2 대',
  2: 'nf21~24  news1 끝    N2~N1 경계',
  3: 'nf25~48  news2       N1 대 (주력)',
  4: '빈도 순위 없음        N1 초과 (선택)',
}
