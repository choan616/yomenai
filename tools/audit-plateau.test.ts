// 정체기 실측 집계 검증 — 상습 표현 판정, 같은 오답 되풀이, 재발, 7일 창 분리
import { describe, expect, it } from 'vitest'
import { plateauProfile } from './audit-plateau.ts'
import type { ReviewEvent } from '../src/core/types.ts'

const DAY = 864e5
let seq = 0
function ev(idiomId: string, at: number, correct: boolean, answer = 'x'): ReviewEvent {
  seq++
  return {
    id: `e${String(seq).padStart(4, '0')}`,
    userId: 'local',
    deviceId: 'dev',
    at,
    idiomId,
    cardType: 'reading',
    mistakeType: null,
    deletedAt: null,
    type: 'review',
    grade: correct ? 3 : 1,
    answer,
    expected: 'x',
    correct,
    elapsedMs: 1000,
  }
}

describe('plateauProfile', () => {
  it('읽기 채점이 없으면 null', () => {
    expect(plateauProfile([])).toBeNull()
  })

  it('누적 오답 3회부터 상습이고, 같은 오답 되풀이와 재발을 센다', () => {
    const p = plateauProfile([
      // a: 오답 3회(같은 답 둘), 정답 뒤 오답 1회
      ev('a', 1, false, 'p'), ev('a', 2, true), ev('a', 3, false, 'p'), ev('a', 4, false, 'q'),
      // b: 오답 2회 — 상습 아님
      ev('b', 1, false), ev('b', 2, false), ev('b', 3, true),
    ])!
    expect(p.chronic).toBe(1)
    expect(p.chronicWrong).toBe(3)
    expect(p.wrongTotal).toBe(5)
    expect(p.sameWrongRepeated).toBe(1)
    expect(p.relapse).toEqual({ afterCorrect: 1, wrongNext: 1 })
  })

  it('창은 마지막 이벤트로부터 7일이고 상습과 나머지를 가른다', () => {
    const t = 30 * DAY
    const p = plateauProfile([
      ev('a', 1, false), ev('a', 2, false), ev('a', 3, false), // 창 밖
      ev('a', t - DAY, true),
      ev('b', t - 8 * DAY, true), // 창 밖
      ev('b', t, false),
    ])!
    expect(p.window.chronic).toEqual({ n: 1, ok: 1 })
    expect(p.window.rest).toEqual({ n: 1, ok: 0 })
  })
})
