// 오답 유형의 한국어 라벨 (PLAN §6). 오답 상세·진단 리포트가 공유한다
import type { MistakeType } from '../core/types.ts'

export const MISTAKE_LABEL: Record<MistakeType, string> = {
  ONYOMI_CHOICE: '음독 선택',
  RENDAKU: '연탁',
  SOKUON: '촉음',
  CHOON: '장음',
  MIXED_READING: '음훈 혼독',
  KO_INTERFERENCE: '한국음 간섭',
  // 분류기가 아직 안 내는 예약 유형 (types.ts 참조). 화면에 뜰 일은 없지만 exhaustive 라 채운다
  OKURIGANA: '오쿠리가나',
}
