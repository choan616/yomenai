// 오답 문자열을 정답과 자리별로 대조해 어긋난 글자만 표시하기 위한 순수 함수
export interface DiffChar {
  char: string
  /** 정답의 어느 자리와 순서대로 대응하는 글자면 true (최장 공통부분수열) */
  match: boolean
}

/**
 * `answer` 의 각 글자를 `expected` 와 최장 공통부분수열(LCS)로 대조한다.
 *
 * 자리별 비교(index 가 같으면 비교)가 아니라 LCS 를 쓰는 이유 — 촉음 하나가 빠지거나
 * 늘어나면 그 뒤 글자가 전부 밀리는데, 자리별 비교는 그 뒤 전부를 오답으로 표시한다.
 * LCS 는 밀린 뒤에도 같은 글자를 다시 찾아 맞춰, 실제로 다른 글자만 남긴다.
 */
export function diffAnswer(expected: string, answer: string): DiffChar[] {
  const e = [...expected]
  const a = [...answer]
  const dp: number[][] = Array.from({ length: e.length + 1 }, () =>
    new Array<number>(a.length + 1).fill(0),
  )
  for (let i = e.length - 1; i >= 0; i--) {
    for (let j = a.length - 1; j >= 0; j--) {
      dp[i][j] = e[i] === a[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const matched = new Array<boolean>(a.length).fill(false)
  let i = 0
  let j = 0
  while (i < e.length && j < a.length) {
    if (e[i] === a[j]) {
      matched[j] = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++
    } else {
      j++
    }
  }

  return a.map((char, idx) => ({ char, match: matched[idx] }))
}
