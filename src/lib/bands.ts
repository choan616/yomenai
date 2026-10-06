// JMdict 우선순위 태그를 난이도 밴드 0~4로 매핑한다 (PLAN §4). Phase 2에서 nf/news 상관 실측 후 확정

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

export function bandOf(idiom: { priority: string[] }): Band {
  return priorityToBand(idiom.priority)
}

export const BAND_LABEL: Record<Band, string> = {
  0: 'nf01~10  news1 전반  N3 이하',
  1: 'nf11~20  news1 중반  N2 대',
  2: 'nf21~24  news1 끝    N2~N1 경계',
  3: 'nf25~48  news2       N1 대 (주력)',
  4: '빈도 순위 없음        N1 초과 (선택)',
}

/**
 * 화면에 보이는 밴드 이름 (2026-10-06 사용자 「밴드라는 명칭을 이해하기 쉽게」 → 「A(등산)」).
 * 번호만 있으면 높을수록 좋은지 낮을수록 좋은지 안 읽혔다. 위로 오를수록 드물고 어려운 말이다 —
 * 수준이 높다는 건 더 높은 데까지 안정적으로 읽는다는 뜻이다. 묶어 부를 때는 「코스」라 한다.
 * 코드 안의 `band` 번호·기록·주석은 그대로고, 화면 문구만 이 이름을 거친다.
 * 기각: 「단계」(어느 쪽이 좋은지 안 읽힘), 「레벨」(나중의 레벨 제도와 충돌), JLPT 급 이름(PLAN §4 — 근사라서)
 */
export const BAND_NAME: Record<Band, string> = {
  0: '산책로',
  1: '뒷산',
  2: '중턱',
  3: '능선',
  4: '정상',
}

/** 화면용 이름. 범위 밖 번호가 들어와도 깨지지 않게 번호로 돌려준다 */
export function bandName(band: number): string {
  return BAND_NAME[band as Band] ?? `밴드 ${band}`
}

/** 이름 뒤에 붙는 주격 조사 — 받침이 없으면 「가」, 있으면 「이」 (산책로가 · 뒷산이) */
export function bandNameIga(band: number): string {
  const name = bandName(band)
  const code = name.charCodeAt(name.length - 1) - 0xac00
  const open = code >= 0 && code <= 11171 && code % 28 === 0
  return `${name}${open ? '가' : '이'}`
}

/**
 * 밴드 옆에 병기하는 짧은 설명. UI 라벨은 자체 이름(`BAND_NAME`)을 쓰고 JLPT 는 설명에만
 * 둔다는 PLAN §4 규칙을 지키기 위한 것이다. `BAND_LABEL` 은 nf 코드까지 있어 화면엔 길다.
 */
export const BAND_NOTE: Record<Band, string> = {
  0: 'N3 이하',
  1: 'N2 대',
  2: 'N2~N1 경계',
  3: 'N1 대',
  4: 'N1 초과',
}
