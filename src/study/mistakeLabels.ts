// 오답 유형의 한국어 라벨 (PLAN §6). 오답 상세·진단 리포트가 공유한다
import type { MistakeType } from '../core/types.ts'

export const MISTAKE_LABEL: Record<MistakeType, string> = {
  ONYOMI_CHOICE: '음독 선택',
  RENDAKU: '연탁',
  SOKUON: '촉음',
  CHOON: '장음',
  MIXED_READING: '음훈 혼독',
  KO_INTERFERENCE: '한국음 간섭',
}
