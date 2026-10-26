// 환기 퀴즈를 세션 상태에 연결하는 순수 보조 — 진행 칸 계산·난수·덩어리 소요 시간 기록 (PLAN §11 S4 ③)

/**
 * 지금 퀴즈 덩어리 차례인가. 카드 순회가 `at` 에 닿았고 아직 안 지났을 때다.
 * 소개로 건너뛴 카드 때문에 순회가 `at` 을 훌쩍 넘길 수 있어 `===` 가 아니라 `>=` 로 본다.
 * 순회가 끝났으면(`idx >= cardCount`) 세션 끝에 퀴즈를 세우지 않는다 — 환기가 아니라 군더더기다
 */
export function quizPending(
  idx: number,
  cardCount: number,
  quizAt: number | null,
  done: boolean,
): boolean {
  return quizAt !== null && !done && idx >= quizAt && idx < cardCount
}

/**
 * 진행 표시. 퀴즈 덩어리는 **한 칸**이다 — 안 문항 번호를 따로 세지 않는다.
 * 퀴즈를 지나면 카드 순회 인덱스보다 1 크게 보인다.
 */
export function quizProgress(
  idx: number,
  cardCount: number,
  quizAt: number | null,
  done: boolean,
): { index: number; total: number } {
  if (quizAt === null) return { index: Math.min(idx, cardCount), total: cardCount }
  const total = cardCount + 1
  if (done) return { index: Math.min(idx, cardCount) + 1, total }
  return { index: Math.min(idx, quizAt), total }
}

/** mulberry32 — select.ts·diagnostic.ts 와 같은 계열. 퀴즈 보기 섞기용 */
export function quizRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 덩어리 소요 시간(ms)을 남기는 localStorage 키. 최근 `QUIZ_TIMES_KEEP` 개만 둔다 */
export const QUIZ_TIMES_KEY = 'yomenai.quizTimes'
export const QUIZ_TIMES_KEEP = 20

/** 저장돼 있던 값(깨졌을 수 있다)에 한 개를 덧붙이고 최근 `QUIZ_TIMES_KEEP` 개로 자른다 */
export function appendQuizTime(prev: unknown, ms: number): number[] {
  const old = Array.isArray(prev)
    ? prev.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
    : []
  return [...old, Math.round(ms)].slice(-QUIZ_TIMES_KEEP)
}

/** 실패해도(사생활 보호 모드·용량) 세션은 그대로 간다 */
export function saveQuizTime(ms: number): void {
  try {
    const raw = localStorage.getItem(QUIZ_TIMES_KEY)
    let prev: unknown = []
    try {
      prev = raw === null ? [] : JSON.parse(raw)
    } catch {
      prev = []
    }
    localStorage.setItem(QUIZ_TIMES_KEY, JSON.stringify(appendQuizTime(prev, ms)))
  } catch {
    /* 계측일 뿐이다 */
  }
}

/** 퀴즈에서 담은 표현이 들어가는 묶음 — 끝말잇기(`SHIRITORI_LIST`)와 같은 규칙으로 늘 이 묶음이다 */
export const QUIZ_STAR_LIST = '퀴즈'

/** 「모르는 표현은 눌러서 담아요」 안내를 이미 보였는지. 한 번 보인 뒤에는 안 띄운다 */
export const QUIZ_STAR_HINT_KEY = 'yomenai.quizStarHint'

export function quizStarHintSeen(): boolean {
  try {
    return localStorage.getItem(QUIZ_STAR_HINT_KEY) === '1'
  } catch {
    return false
  }
}

export function markQuizStarHintSeen(): void {
  try {
    localStorage.setItem(QUIZ_STAR_HINT_KEY, '1')
  } catch {
    /* 안내가 한 번 더 뜰 뿐이다 */
  }
}
