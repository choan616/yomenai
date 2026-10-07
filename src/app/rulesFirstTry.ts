// 규칙 절 화면의 첫 만남 줄 문구 — Rules.tsx 에서 뽑았다 (oxlint only-export-components, 2026-10-07 8단계)
import { FIRST_TRY_MIN_SAMPLE, type FirstTryRate } from '../core/firstTry.ts'

/**
 * 재는 절의 첫 만남 줄 문구.
 *
 * 집계(`firstTryByRule`)는 안 바뀐다 — 문턱 미만의 표본도 그대로 센다. 화면만 그 비율을
 * 「단정」으로 읽히지 않게 가린다. 연성처럼 표본 1개로 0% 가 뜨면 「규칙을 못 익혔다」가
 * 아니라 「아직 아무것도 모른다」인데 숫자가 그걸 구분 못 했다 (decisions.md 참조).
 */
export function firstTryLineText(rate: FirstTryRate): string {
  if (rate.seen === 0) return '아직 처음 만난 말이 없어요'
  if (rate.seen < FIRST_TRY_MIN_SAMPLE) return `처음 만난 말이 ${rate.seen}개뿐이라 아직 비율을 안 내요`
  return `처음 만난 ${rate.seen}개 중 ${rate.correct}개를 읽었어요`
}
