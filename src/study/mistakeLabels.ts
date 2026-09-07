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

/**
 * 오답 유형별 "무엇을 익히면 되는지" 한 줄. 진단 리포트의 처방에서 쓴다 (Phase 10).
 *
 * 라벨과 달리 이건 규칙 설명이라 예시를 하나씩 붙였다. 규칙 하나가 여러 숙어에 걸리는
 * 유형들이라, 개별 숙어를 외우는 것보다 이쪽이 먼저다.
 */
export const MISTAKE_ADVICE: Record<MistakeType, string> = {
  ONYOMI_CHOICE:
    '한 한자가 음독을 여럿 가질 때 어느 쪽인지 고르는 자리예요. 같은 한자를 쓰는 숙어를 묶어서 보면 어느 쪽이 흔한지가 갈려요.',
  RENDAKU:
    '뒷 글자의 첫소리가 탁음으로 바뀌는 자리예요 — 三日月 みかづき. 뒷 글자가 이미 탁음을 품고 있으면 잘 안 일어나요(라이먼의 법칙).',
  SOKUON:
    'ツ·チ·ク·キ 로 끝나는 음독 뒤에 カ·サ·タ·ハ행이 오면 촉음으로 붙어요 — 発達 はったつ, 学校 がっこう.',
  CHOON: '장음이 붙는지 아닌지의 자리예요 — 特徴 とくちょう. ょ·ゅ 뒤의 う 를 빠뜨리는 게 가장 잦아요.',
  MIXED_READING:
    '음+훈(重箱 じゅうばこ)과 훈+음(湯桶 ゆとう)이 섞인 읽기예요. 이 두 패턴만 따로 모아 보면 눈에 익어요.',
  KO_INTERFERENCE:
    '한국 한자음이 먼저 떠오른 자리예요. 오답 상세의 한국음 대조를 같이 보면 어느 글자가 끌어당기는지 보여요.',
  // 분류기가 아직 안 내는 예약 유형 (types.ts 참조). exhaustive 라 채운다
  OKURIGANA: '한자에 붙는 가나를 어디서 끊는지의 자리예요.',
}
