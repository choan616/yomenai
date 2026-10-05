// 리포트 맨 위 요약 타일 넷의 문구 — 값은 리포트가 이미 세는 것을 그대로 옮긴다 (2026-10-05, context-notes 같은 날 절)
//
// 타일은 한눈에 읽는 요약이고, 눌러서 상세(표·달력·분포)를 하단 시트로 연다. 문구 규칙은 화면 문구와 같다:
// 「끊김은 말하지 않는다」(streak.ts) — 현재 연속이 없을 때 「끊겼다」는 말을 하지 않고 이번 달 학습일로 대신 말한다.

export type SheetKind = 'level' | 'days' | 'mist' | 'weak'

export interface Tile {
  /** 누르면 열 시트 */
  sheet: SheetKind
  label: string
  value: string
  sub: string
  /** 값을 오답 색으로 */
  warn?: boolean
}

interface LevelLike {
  solidThrough: number | null
  edge: number | null
}

export interface TileInput {
  level: LevelLike
  reviews: number
  /** 0~100 */
  accuracy: number
  streak: { current: number; longest: number }
  /** 이번 달 학습일·장수 */
  month: { days: number; cards: number }
  /** 1등 오답 유형. 분류된 오답이 없으면 null */
  top: { label: string; count: number } | null
  totalWrong: number
}

export function summaryTiles(i: TileInput): Tile[] {
  const { solidThrough, edge } = i.level
  const level: Tile =
    edge !== null
      ? { sheet: 'level', label: '수준', value: `밴드 ${edge}`, sub: '흔들려요' }
      : solidThrough !== null
        ? { sheet: 'level', label: '수준', value: `밴드 ${solidThrough}`, sub: '안정이에요' }
        : { sheet: 'level', label: '수준', value: '—', sub: '아직 기록이 적어요' }

  const accuracy: Tile = {
    sheet: 'level',
    label: '전체 정답률',
    value: `${i.accuracy}%`,
    sub: `읽기 ${i.reviews}회`,
  }

  const days: Tile =
    i.streak.current >= 2
      ? {
          sheet: 'days',
          label: '학습한 날',
          value: `${i.streak.current}일째`,
          sub: i.streak.longest > i.streak.current ? `최장 ${i.streak.longest}일` : '이어 가는 중',
        }
      : {
          sheet: 'days',
          label: '학습한 날',
          value: i.month.days > 0 ? `이번 달 ${i.month.days}일` : '—',
          sub: i.month.cards > 0 ? `${i.month.cards}장` : '아직 없어요',
        }

  const mist: Tile = i.top
    ? {
        sheet: 'mist',
        label: '많이 틀린 유형',
        value: i.top.label,
        sub:
          i.totalWrong > 0
            ? `${i.top.count}회 · 오답의 ${Math.round((i.top.count / i.totalWrong) * 100)}%`
            : `${i.top.count}회`,
        warn: true,
      }
    : { sheet: 'mist', label: '오답 유형', value: '없어요', sub: '지금은 짚을 게 없어요' }

  return [level, accuracy, days, mist]
}
