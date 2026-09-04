// 숙어를 읽기 교정 / 어휘 확장 중 어디에 둘지 자동 배정한다 (PLAN §6 "모드 자동 배정")
import { State, type Card } from 'ts-fsrs'
import { isStable } from './scheduler.ts'
import type { CardType, KoreanCategory, ModeSource, StudyMode } from './types.ts'

export interface ModeInput {
  /** 1단계 — Phase 3 한국어 대조 분류. 1=동형동의 2=동형이의 3=일본 고유 */
  category: KoreanCategory
  /** 2단계 — 진입 진단의 "뜻은 알고 계셨나요" 응답 */
  meaningKnown?: boolean
  /** 3단계 — 학습 중인 뜻 카드 상태 */
  meaningCard?: Card
}

export interface ModeAssignment {
  mode: StudyMode
  source: ModeSource
}

/**
 * 3단계를 순서대로 덮어쓴다. 뒤 단계일수록 실제 관측에 가까우므로 앞 단계를 이긴다.
 *
 * 1. 한국어 대조 결과 — 동형동의는 뜻을 이미 아는 쪽이니 교정, 나머지는 확장
 * 2. 진입 진단 응답 — 읽기를 틀린 문항에만 물어본 것이라 사전 분류보다 정확하다
 * 3. 학습 중 재배치 — 뜻이 안정되면 교정으로 이관, 뜻을 틀리면(재학습 상태) 확장으로 되돌림
 */
export function assignMode(input: ModeInput): ModeAssignment {
  let mode: StudyMode = input.category === 1 ? 'correction' : 'expansion'
  let source: ModeSource = 'korean-class'

  if (input.meaningKnown !== undefined) {
    mode = input.meaningKnown ? 'correction' : 'expansion'
    source = 'diagnostic'
  }

  const card = input.meaningCard
  if (card !== undefined) {
    if (card.state === State.Relearning) {
      mode = 'expansion'
      source = 'reassign'
    } else if (isStable(card)) {
      mode = 'correction'
      source = 'reassign'
    }
  }

  return { mode, source }
}

/**
 * 그 모드에서 실제로 출제하는 카드 종류.
 * 교정은 읽기만, 확장은 둘 다. 확장 숙어의 뜻이 안정되면 모드 자체가 교정으로 넘어가면서
 * 뜻 카드가 자연히 빠진다 — 이게 PLAN 의 "meaning 안정 시 저빈도로 내림"이다.
 */
export function activeCardTypes(mode: StudyMode): CardType[] {
  return mode === 'correction' ? ['reading'] : ['reading', 'meaning']
}
