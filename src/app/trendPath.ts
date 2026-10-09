// 추이 선을 부드러운 3차 베지어 경로로 바꾼다 — 점을 지나고 점 사이에서 값을 넘치지 않는다
//
// **단조 3차 보간**(Fritsch–Carlson)이다. Catmull-Rom 같은 일반 스플라인은 급히 오른 뒤의 평평한 구간에서
// 출렁이며 100% 를 넘거나, 데이터에 없던 오르내림을 그린다 — 정답률 선에서는 거짓말이다.
// 점은 날짜 순이라 x 가 늘어난다(같은 날 두 점이 없다).

export interface Pt {
  x: number
  y: number
}

const f = (n: number) => n.toFixed(1)

export function smoothPath(pts: readonly Pt[]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${f(pts[0]!.x)},${f(pts[0]!.y)}`

  const dx: number[] = []
  const m: number[] = [] // 구간 기울기
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]!.x - pts[i]!.x)
    m.push((pts[i + 1]!.y - pts[i]!.y) / dx[i]!)
  }

  // 점마다 접선 기울기 — 양쪽 기울기의 부호가 다르면(꺾이는 점) 0 이라 점이 극값에 머문다
  const t: number[] = [m[0]!]
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2)
  t.push(m[n - 2]!)

  // 접선이 너무 가파르면 구간 안에서 넘치므로 줄인다
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0
      t[i + 1] = 0
      continue
    }
    const a = t[i]! / m[i]!
    const b = t[i + 1]! / m[i]!
    const s = a * a + b * b
    if (s > 9) {
      const k = 3 / Math.sqrt(s)
      t[i] = k * a * m[i]!
      t[i + 1] = k * b * m[i]!
    }
  }

  let d = `M${f(pts[0]!.x)},${f(pts[0]!.y)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3
    const p = pts[i]!
    const q = pts[i + 1]!
    d += `C${f(p.x + h)},${f(p.y + t[i]! * h)} ${f(q.x - h)},${f(q.y - t[i + 1]! * h)} ${f(q.x)},${f(q.y)}`
  }
  return d
}
