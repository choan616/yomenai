// 수준 시트의 정답률 추이 — 최근 4주 선 하나, 칩으로 전체·코스별을 고른다 (2026-10-09, 사용자 지시)
import { useState } from 'react'
import { shiftDateKey } from '../core/attendance.ts'
import { TREND_DAYS, type AccuracyTrends, type TrendKey } from '../core/accuracyTrend.ts'
import { LEVEL_MIN_SEEN, LEVEL_SOLID_RATE, LEVEL_WINDOW } from '../core/level.ts'
import { bandName, type Band } from '../lib/bands.ts'

const W = 320
const H = 116
const PLOT = { l: 34, r: 306, t: 12, b: 88 }

/** `date` 가 4주 첫날에서 며칠째인가 (0 ~ TREND_DAYS-1) */
function dayIndex(from: string, date: string): number {
  const [fy, fm, fd] = from.split('-').map(Number)
  const [y, m, d] = date.split('-').map(Number)
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000)
}

const md = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d}`
}
const mdKo = (date: string) => {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일`
}

export function AccuracyTrend({
  trends,
  courses,
  today,
}: {
  trends: AccuracyTrends
  /** 칩으로 고를 수 있는 코스 (수준을 재는 0~3) */
  courses: readonly Band[]
  /** 오늘의 날짜 키 (4주의 끝) */
  today: string
}) {
  const [pick, setPick] = useState<TrendKey>('all')
  /** 고른 칩에서 점을 눌러 고른 날 — 칩을 바꾸면 비워 마지막 점으로 돌아간다 */
  const [at, setAt] = useState<number | null>(null)
  const points = trends.get(pick) ?? []
  const from = shiftDateKey(today, -(TREND_DAYS - 1))
  const active = at !== null && at < points.length ? at : points.length - 1
  const cur = points[active]

  /** 칩마다 점이 있는지 — 없으면 고를 수 없다(표본이 쌓이면 열린다) */
  const has = (k: TrendKey) => (trends.get(k)?.length ?? 0) > 0
  const keys: TrendKey[] = ['all', ...courses]
  const color = pick === 'all' ? 'var(--text)' : `var(--band-${pick})`

  // 세로 범위 — 점이 한 줄로 납작해지지 않게 아래를 당긴다. 위는 늘 100%
  const minPct = points.length > 0 ? Math.min(...points.map((p) => p.rate)) * 100 : 60
  const lo = Math.max(0, Math.min(60, Math.floor((minPct - 5) / 10) * 10))
  const X = (i: number) => PLOT.l + (dayIndex(from, points[i]!.date) / (TREND_DAYS - 1)) * (PLOT.r - PLOT.l)
  const Y = (rate: number) => PLOT.b - ((rate * 100 - lo) / (100 - lo)) * (PLOT.b - PLOT.t)
  const solidPct = Math.round(LEVEL_SOLID_RATE * 100)
  const ticks = [...new Set([lo, solidPct, 100])]

  const pickAt = (e: React.PointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    let best = 0
    for (let i = 1; i < points.length; i++) {
      if (Math.abs(X(i) - x) < Math.abs(X(best) - x)) best = i
    }
    setAt(best)
  }
  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (step === 0 && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    if (e.key === 'Home') setAt(0)
    else if (e.key === 'End') setAt(points.length - 1)
    else setAt(Math.min(points.length - 1, Math.max(0, active + step)))
  }

  const label = (k: TrendKey) => (k === 'all' ? '전체' : bandName(k))
  const summary =
    points.length >= 2
      ? `${label(pick)} 정답률 ${mdKo(points[0]!.date)} ${Math.round(points[0]!.rate * 100)}%에서 ${mdKo(points.at(-1)!.date)} ${Math.round(points.at(-1)!.rate * 100)}%`
      : `${label(pick)} 정답률 ${cur ? Math.round(cur.rate * 100) : 0}%`

  return (
    <div className="trend">
      <div className="ladder-head">
        <p className="ladder-title">정답률 추이</p>
        <p className="trend-range">최근 4주</p>
      </div>

      <div className="trend-chips" role="group" aria-label="추이를 볼 범위">
        {keys.map((k) => (
          <button
            key={String(k)}
            type="button"
            className={`chip${pick === k ? ' on' : ''}`}
            aria-pressed={pick === k}
            disabled={!has(k)}
            onClick={() => {
              setPick(k)
              setAt(null)
            }}
          >
            {k !== 'all' && <span className="trend-dot" style={{ background: `var(--band-${k})` }} aria-hidden="true" />}
            {label(k)}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <p className="trend-empty">읽기 채점이 {LEVEL_MIN_SEEN}회 쌓이면 선이 그려져요.</p>
      ) : (
        <>
          {/* 값이 먼저, 날짜가 뒤 — 점을 누르면 이 줄이 바뀐다. 그림은 읽어 주지 못하니 이 줄이 대신 읽힌다 */}
          <p className="trend-readout" aria-live="polite">
            <b>{Math.round(cur!.rate * 100)}%</b>
            <span>
              {mdKo(cur!.date)} · 최근 {cur!.n}회
            </span>
          </p>
          <svg
            className="trend-svg"
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={summary}
            tabIndex={0}
            onKeyDown={onKey}
          >
            {ticks.map((t) => {
              const y = PLOT.b - ((t - lo) / (100 - lo)) * (PLOT.b - PLOT.t)
              return (
                <g key={t}>
                  <line className={t === solidPct ? 'trend-grid solid' : 'trend-grid'} x1={PLOT.l} x2={PLOT.r} y1={y} y2={y} />
                  <text className="trend-tick" x={PLOT.l - 6} y={y + 4} textAnchor="end">
                    {t}%
                  </text>
                </g>
              )
            })}
            <text className="trend-tick" x={PLOT.l} y={H - 8} textAnchor="start">
              {md(from)}
            </text>
            <text className="trend-tick" x={PLOT.r} y={H - 8} textAnchor="end">
              {md(today)}
            </text>

            {points.length >= 2 && (
              <polyline
                className="trend-line"
                stroke={color}
                points={points.map((p, i) => `${X(i)},${Y(p.rate)}`).join(' ')}
              />
            )}
            {/* 눌러서 고른 날은 세로선이 붙는다(기본인 마지막 점에는 없다). 점에는 바탕색 고리를 둘러 선 위에서도 또렷하다 */}
            {at !== null && <line className="trend-cross" x1={X(active)} x2={X(active)} y1={PLOT.t} y2={PLOT.b} />}
            <circle className="trend-dot-mark" cx={X(active)} cy={Y(cur!.rate)} r={5} fill={color} />
            {active !== points.length - 1 && (
              <circle className="trend-dot-mark" cx={X(points.length - 1)} cy={Y(points.at(-1)!.rate)} r={4} fill={color} />
            )}
            {/* 누를 자리 — 점이 아니라 그림 전체가 눌림 영역이다. 가장 가까운 날로 붙는다 */}
            <rect
              className="trend-hit"
              x={PLOT.l - 6}
              y={0}
              width={PLOT.r - PLOT.l + 12}
              height={PLOT.b + 8}
              onPointerDown={pickAt}
              onPointerMove={(e) => e.buttons > 0 && pickAt(e)}
            />
          </svg>
          <p className="trend-note">
            최근 {LEVEL_WINDOW}회 채점 기준 · {solidPct}% 선이 「안정」의 문턱이에요.
          </p>
          <details className="trend-table">
            <summary>표로 보기</summary>
            <table>
              <thead>
                <tr>
                  <th scope="col">날짜</th>
                  <th scope="col">정답률</th>
                  <th scope="col">채점</th>
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{mdKo(p.date)}</th>
                    <td>{Math.round(p.rate * 100)}%</td>
                    <td>{p.n}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </>
      )}
    </div>
  )
}
