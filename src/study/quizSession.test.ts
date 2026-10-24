// 환기 퀴즈의 세션 연결(진행 칸·차례 판정·계측 기록)을 검증한다 (S4 ③)
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  QUIZ_TIMES_KEEP,
  QUIZ_TIMES_KEY,
  appendQuizTime,
  quizPending,
  quizProgress,
  quizRng,
  saveQuizTime,
} from './quizSession.ts'

describe('quizPending', () => {
  it('순회가 퀴즈 자리에 닿았고 아직 안 지났을 때만 참이다', () => {
    expect(quizPending(2, 10, 3, false)).toBe(false)
    expect(quizPending(3, 10, 3, false)).toBe(true)
    expect(quizPending(3, 10, 3, true)).toBe(false)
  })

  it('소개 숙어를 건너뛰어 순회가 자리를 넘겨도 차례다', () => {
    expect(quizPending(5, 10, 3, false)).toBe(true)
  })

  it('퀴즈가 없거나 순회가 끝났으면 거짓이다', () => {
    expect(quizPending(3, 10, null, false)).toBe(false)
    expect(quizPending(10, 10, 3, false)).toBe(false)
  })
})

describe('quizProgress', () => {
  it('퀴즈가 없으면 카드 수 그대로다', () => {
    expect(quizProgress(4, 20, null, false)).toEqual({ index: 4, total: 20 })
  })

  it('퀴즈는 한 칸이다 — 분모는 카드 수 + 1 이다', () => {
    // 채점 카드 19장 + 퀴즈 1칸 = 설정 20장
    expect(quizProgress(0, 19, 10, false).total).toBe(20)
    expect(quizProgress(18, 19, 10, true).total).toBe(20)
  })

  it('퀴즈 전에는 카드 인덱스 그대로, 퀴즈 중에는 자리에 머문다', () => {
    expect(quizProgress(9, 19, 10, false).index).toBe(9)
    expect(quizProgress(10, 19, 10, false).index).toBe(10)
  })

  it('퀴즈를 지나면 카드 인덱스보다 1 크다', () => {
    expect(quizProgress(10, 19, 10, true).index).toBe(11)
    expect(quizProgress(19, 19, 10, true).index).toBe(20)
  })

  it('소개 건너뛰기로 순회가 퀴즈 자리를 넘겼어도 퀴즈 중 칸은 자리에 머문다', () => {
    expect(quizProgress(12, 19, 10, false).index).toBe(10)
  })
})

describe('quizRng', () => {
  it('같은 시드는 같은 순서, 다른 시드는 다른 순서다', () => {
    const a = quizRng(7)
    const b = quizRng(7)
    const c = quizRng(8)
    const seq = (r: () => number) => [r(), r(), r()]
    expect(seq(a)).toEqual(seq(b))
    expect(seq(quizRng(7))).not.toEqual(seq(c))
  })
})

describe('appendQuizTime', () => {
  it('최근 20개만 남긴다', () => {
    let list: number[] = []
    for (let i = 1; i <= QUIZ_TIMES_KEEP + 5; i++) list = appendQuizTime(list, i * 1000)
    expect(list).toHaveLength(QUIZ_TIMES_KEEP)
    expect(list[0]).toBe(6000)
    expect(list[list.length - 1]).toBe((QUIZ_TIMES_KEEP + 5) * 1000)
  })

  it('깨진 저장값은 버리고 새로 시작한다', () => {
    expect(appendQuizTime('망가짐', 1234.6)).toEqual([1235])
    expect(appendQuizTime([1, 'x', null, 3], 5)).toEqual([1, 3, 5])
  })
})

describe('saveQuizTime', () => {
  afterEach(() => vi.unstubAllGlobals())

  function fakeStorage(init: Record<string, string> = {}) {
    const data = new Map(Object.entries(init))
    return {
      data,
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
    }
  }

  it('이어 붙여 JSON 배열로 저장한다', () => {
    const st = fakeStorage({ [QUIZ_TIMES_KEY]: '[100,200]' })
    vi.stubGlobal('localStorage', st)
    saveQuizTime(300)
    expect(JSON.parse(st.data.get(QUIZ_TIMES_KEY)!)).toEqual([100, 200, 300])
  })

  it('저장소가 막혀 있어도 던지지 않는다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => saveQuizTime(300)).not.toThrow()
  })

  it('저장값이 JSON 이 아니어도 새로 시작한다', () => {
    const st = fakeStorage({ [QUIZ_TIMES_KEY]: '{{' })
    vi.stubGlobal('localStorage', st)
    saveQuizTime(50)
    expect(JSON.parse(st.data.get(QUIZ_TIMES_KEY)!)).toEqual([50])
  })
})
