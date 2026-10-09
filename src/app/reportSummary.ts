// 리포트 맨 위 요약 타일 넷의 문구 — 값은 리포트가 이미 세는 것을 그대로 옮긴다 (2026-10-05, context-notes 같은 날 절)
//
// 타일은 한눈에 읽는 요약이고, 눌러서 상세(표·달력·분포)를 하단 시트로 연다. 문구 규칙은 화면 문구와 같다:
// 「끊김은 말하지 않는다」(streak.ts) — 현재 연속이 없을 때 「끊겼다」는 말을 하지 않고 이번 달 학습일로 대신 말한다.

import { bandName } from '../lib/bands.ts'

export type SheetKind = 'level' | 'days' | 'mist' | 'browse' | 'weak' | 'opinion'

export interface Tile {
  /** 누르면 열 시트 */
  sheet: SheetKind
  label: string
  value: string
  sub: string
  /** 값을 오답 색으로 */
  warn?: boolean
  /** 값(코스 이름)의 먹 농도 단계 — 코스 번호 그대로다. 오를수록 진하다 (`.tile-v[data-shade]`) */
  shade?: number
}

interface LevelLike {
  solidThrough: number | null
  edge: number | null
}

export interface TileInput {
  level: LevelLike
  streak: { current: number; longest: number }
  /** 이번 달 학습일·장수 */
  month: { days: number; cards: number }
  /** 1등 오답 유형. 분류된 오답이 없으면 null */
  top: { label: string; count: number } | null
  totalWrong: number
  /** 취약 음독 수와 그중 가장 높은 오답률(0~1). 없으면 null */
  weak: { count: number; topRate: number } | null
}

export function summaryTiles(i: TileInput): Tile[] {
  const { solidThrough, edge } = i.level
  // 수준은 **안정적으로 읽는 가장 높은 코스**다 — 흔들리는 코스가 아니다 (2026-10-06 사용자 「흔들리면 수준은 그 이전 단계가 아닌가」).
  // 흔들리는 코스(경계)는 부제로 따로 말한다. 안정이 없는데 경계가 둘째 코스 이상이면 그 바로 아래를 수준으로 본다 —
  // 산책로(0)는 신규 도입에서 기본으로 건너뛰는 쉬운 말이라 따로 재지 않기 때문이다(PLAN §4, `minBand`)
  const course = solidThrough ?? (edge !== null && edge > 0 ? edge - 1 : null)
  const level: Tile =
    course !== null
      ? {
          sheet: 'level',
          label: '수준',
          value: bandName(course),
          sub: edge !== null ? `경계 ${bandName(edge)}` : '안정이에요',
          shade: course,
        }
      : edge !== null
        // 안정 구간이 전혀 없을 때만 온다(course===null 은 edge===0 일 때뿐이다 — edge>0 이면
        // 항상 course=edge-1 로 위 분기를 탄다). 「—」는 값이 없다는 뜻으로 읽혀 사용자가
        // 자기 수준을 전혀 알 수 없었다(2026-10-07 사용자 지적) — 아는 것(산책로가 흔들린다는
        // 것)을 그대로 보여준다. 기준(LEVEL_SOLID_RATE·LEVEL_WINDOW)은 그대로다, 문구만 바꿨다
        ? { sheet: 'level', label: '수준', value: bandName(edge), sub: '흔들리고 있어요', shade: edge }
        : { sheet: 'level', label: '수준', value: '—', sub: '아직 기록이 적어요' }

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

  // 전체 정답률 타일은 걷었다 — 수준 시트를 그대로 열어 같은 내용이 두 번 나왔다 (2026-10-06 사용자 확인). 정답률은 수준 시트 안에 남는다
  const weak: Tile = i.weak
    ? { sheet: 'weak', label: '취약 음독', value: `${i.weak.count}개`, sub: `최고 오답률 ${Math.round(i.weak.topRate * 100)}%` }
    : { sheet: 'weak', label: '취약 음독', value: '없어요', sub: '아직 약한 음독이 없어요' }

  return [level, days, mist, weak]
}
