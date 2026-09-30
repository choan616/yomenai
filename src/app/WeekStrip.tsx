// 이번 주 띠 — 홈과 세션 요약이 같이 쓰는 일~토 7칸 + 연속 기록 문구 한 줄 (2026-09-30)
//
// 리포트 달력은 "돌아보는 기록"이고 이 띠는 "오늘 할까"를 정하는 자리의 신호다.
// **문구는 긍정형만 쓴다** (사용자 지시 「빠진 날에 구멍이 생겼다는 네거티브 메시지는
// 노출하지 않는다」). 끊긴 뒤엔 현재 연속을 아예 말하지 않는다 — 「0일째」도 안 쓴다.
// 문구는 weekLine.tsx 가 만든다.
import type { ReactNode } from 'react'
import type { WeekCell } from '../core/attendance.ts'

const DOW = ['일', '월', '화', '수', '목', '금', '토']

export function WeekStrip({
  cells,
  line,
  fillDate,
  slot = false,
}: {
  cells: WeekCell[]
  line: ReactNode
  /** 이번 세션으로 등급이 오른 날 — 요약 화면에서 그 칸만 채움 모션을 준다 */
  fillDate?: string
  /** 계산 전 자리 잡기용. 보이지 않게 같은 높이만 차지한다 (Home 의 `.slot` 관례) */
  slot?: boolean
}) {
  return (
    <div className={`week-strip${slot ? ' slot' : ''}`} aria-hidden={slot || undefined}>
      <ol className="week-cells" aria-label="이번 주 학습">
        {cells.map((c, i) => (
          <li
            key={c.date}
            className="week-cell"
            data-state={cellState(c)}
            data-today={c.today || undefined}
            data-fill={c.date === fillDate || undefined}
            title={c.date}
          >
            <span className="week-dow">{DOW[i]}</span>
            <span className="week-dot" />
          </li>
        ))}
      </ol>
      <p className="week-line">{line}</p>
    </div>
  )
}

/** 칸 상태. 오늘 아직 안 채운 칸은 `pending` — 과거 빈 날(`none`)과 다르게 그린다 */
function cellState(c: WeekCell): string {
  if (c.future) return 'future'
  if (c.tier !== 'none') return c.tier
  return c.today ? 'pending' : 'none'
}
