// 대조 세션 표적 좁히기 검증 — 변형을 실제로 든 조각의 쌍만 추리는지, 대응 없는 유형·실패·빈 결과는 합집합인지
import { describe, expect, it } from 'vitest'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import { ruleFocusPairs, type RuleFocusIdiom } from './ruleFocus.ts'

const lookup = (k: string) => KANJI_FIXTURE[k]

function idiom(headword: string, reading: string, pairIds: string[]): RuleFocusIdiom {
  return { idiomId: headword, headword, reading, pairIds }
}

describe('ruleFocusPairs', () => {
  it('発達 을 촉음으로 틀리면 표적이 発:on:はつ 하나다 — 達:on:たつ 가 안 들어온다', () => {
    const idioms = [idiom('発達', 'はったつ', ['発:on:はつ', '達:on:たつ'])]
    const out = ruleFocusPairs({ idioms, type: 'SOKUON', voicing: null, lookup })
    expect(out).toEqual(['発:on:はつ'])
  })

  it('연탁(三日月 꼴)이면 변형을 든 조각의 쌍만 들어온다', () => {
    // 三(み)·日(か) 는 변형이 없고 月 만 연탁(づき) 으로 갈렸다
    const idioms = [idiom('三日月', 'みかづき', ['三:kun:み', '日:kun:か', '月:kun:つき'])]
    const out = ruleFocusPairs({ idioms, type: 'RENDAKU', voicing: 'rendaku', lookup })
    expect(out).toEqual(['月:kun:つき'])
  })

  it('CHOON 처방이면 합집합 그대로다 (대응 변형이 없다)', () => {
    const idioms = [idiom('特徴', 'とくちょう', ['特:on:とく', '徴:on:ちょう'])]
    const out = ruleFocusPairs({ idioms, type: 'CHOON', voicing: null, lookup })
    expect(out.sort()).toEqual(['徴:on:ちょう', '特:on:とく'])
  })

  it('청탁 미구분(voicing unmarked)도 대응이 없어 합집합이다', () => {
    const idioms = [idiom('発達', 'はったつ', ['発:on:はつ', '達:on:たつ'])]
    const out = ruleFocusPairs({ idioms, type: 'RENDAKU', voicing: 'unmarked', lookup })
    expect(out.sort()).toEqual(['発:on:はつ', '達:on:たつ'])
  })

  it('분해가 실패하는 숙어가 섞여도 나머지 표적이 살아 있다', () => {
    const idioms = [
      idiom('発達', 'はったつ', ['発:on:はつ', '達:on:たつ']),
      idiom('発桁', 'はつけた', ['発:on:はつ', '桁:on:けた']), // 桁 는 사전(KANJI_FIXTURE)에 없다 — 분해 실패
    ]
    const out = ruleFocusPairs({ idioms, type: 'SOKUON', voicing: null, lookup })
    expect(out).toEqual(['発:on:はつ'])
  })

  it('좁혀서 비면 합집합으로 돌아간다 (이 숙어엔 그 변형이 안 걸렸다)', () => {
    // 三日月 는 연탁만 걸렸는데 촉음으로 물으면 narrowed 가 비어 union 으로 돌아간다
    const idioms = [idiom('三日月', 'みかづき', ['三:kun:み', '日:kun:か', '月:kun:つき'])]
    const out = ruleFocusPairs({ idioms, type: 'SOKUON', voicing: null, lookup })
    expect(out.sort()).toEqual(['三:kun:み', '日:kun:か', '月:kun:つき'].sort())
  })
})
