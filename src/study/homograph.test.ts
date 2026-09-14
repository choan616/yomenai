// 동형이독 상대 숙어 찾기 — 이어 묻기의 입구 (2026-09-14)
import { describe, expect, it } from 'vitest'
import { siblingFor, type HomographCandidate } from './homograph.ts'

const ICHIBA: HomographCandidate = { idiomId: '1308300', headword: '市場', reading: 'いちば' }
const SHIJOU: HomographCandidate = { idiomId: '1308305', headword: '市場', reading: 'しじょう' }
const GROUP = [ICHIBA, SHIJOU]

describe('siblingFor', () => {
  it('다른 읽기로 답하면 그 읽기를 가진 숙어를 돌려준다', () => {
    expect(siblingFor(SHIJOU, 'いちば', GROUP)).toEqual(ICHIBA)
    expect(siblingFor(ICHIBA, 'しじょう', GROUP)).toEqual(SHIJOU)
  })

  it('가타카나로 써도 찾는다 — 채점과 같은 정규화를 쓴다', () => {
    expect(siblingFor(SHIJOU, 'イチバ', GROUP)).toEqual(ICHIBA)
  })

  it('자기 읽기를 그대로 쓰면 상대가 없다 — 이어 물을 일이 아니다', () => {
    expect(siblingFor(SHIJOU, 'しじょう', GROUP)).toBeUndefined()
  })

  it('어느 쪽도 아닌 오답이면 상대가 없다', () => {
    expect(siblingFor(SHIJOU, 'しじょ', GROUP)).toBeUndefined()
  })

  // 사전의 altReadings 는 밴드 4 까지 합쳐 계산한다. 밴드 0~3 만 켠 사용자에게는
  // 채점은 통과하는데 물어볼 카드가 없는 읽기가 있다 — 그때는 이어 묻기를 건너뛴다
  it('상대 숙어가 풀에 없으면 undefined 다', () => {
    expect(siblingFor(SHIJOU, 'いちば', [SHIJOU])).toBeUndefined()
    expect(siblingFor(SHIJOU, 'いちば', undefined)).toBeUndefined()
  })

  it('빈 답으로는 아무것도 안 찾는다', () => {
    expect(siblingFor(SHIJOU, '', GROUP)).toBeUndefined()
    expect(siblingFor(SHIJOU, '   ', GROUP)).toBeUndefined()
  })
})
