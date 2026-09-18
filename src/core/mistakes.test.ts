// 오답 유형 6종 자동 판정 검증. 유형별 대표 케이스 3개씩 (checklist Phase 4)
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildKoSiblingIndex,
  classifyMistake,
  explainMistake,
  type MistakeContext,
} from './mistakes.ts'
import { KANJI_FIXTURE } from './mistakes.fixture.ts'
import type { MistakeType } from './types.ts'

function contextFor(kanji: typeof KANJI_FIXTURE): MistakeContext {
  return {
    lookup: (k) => kanji[k],
    koSiblingOnyomi: buildKoSiblingIndex(kanji),
  }
}

const ctx = contextFor(KANJI_FIXTURE)

/** [숙어, 정답 읽기, 오답 입력] */
type Case = [string, string, string]

// OKURIGANA 는 분류기가 아직 안 낸다 (types.ts 예약 슬롯) — 대표 케이스 없음. 그래서 Partial
const CASES: Partial<Record<MistakeType, Case[]>> = {
  // 같은 한자의 *다른* 음독을 골랐다. 답 자체는 일본어로 파싱된다
  ONYOMI_CHOICE: [
    ['発端', 'ほったん', 'はつたん'],
    ['支度', 'したく', 'しど'],
    ['人数', 'にんずう', 'じんすう'],
  ],
  // 連濁·半濁音을 놓쳤다
  RENDAKU: [
    ['三日月', 'みかづき', 'みかつき'],
    ['心配', 'しんぱい', 'しんはい'],
    ['花火', 'はなび', 'はなひ'],
  ],
  // 促音便을 놓쳤다
  SOKUON: [
    ['発達', 'はったつ', 'はつたつ'],
    ['学校', 'がっこう', 'がくこう'],
    ['一体', 'いったい', 'いちたい'],
  ],
  // 장음을 흘렸다
  CHOON: [
    ['特徴', 'とくちょう', 'とくちょ'],
    ['高校', 'こうこう', 'こうこ'],
    ['数字', 'すうじ', 'すじ'],
  ],
  // 重箱·湯桶 읽기를 못 알아보고 한쪽으로 통일했다
  MIXED_READING: [
    ['重箱', 'じゅうばこ', 'じゅうそう'],
    ['大勢', 'おおぜい', 'たいせい'],
    ['荷物', 'にもつ', 'かぶつ'],
  ],
  // 한국음이 같은 *다른* 한자의 음독을 끌어왔다. 자기 한자의 읽기가 아니다
  KO_INTERFERENCE: [
    ['認識', 'にんしき', 'にんしょく'],
    ['温度', 'おんど', 'おんとう'],
    ['感謝', 'かんしゃ', 'かんさ'],
  ],
}

describe('classifyMistake — 유형별 대표 케이스', () => {
  for (const [type, cases] of Object.entries(CASES) as [MistakeType, Case[]][]) {
    it(`${type} 3건을 정확히 분류한다`, () => {
      const got = cases.map(([headword, expected, answer]) =>
        classifyMistake({ headword, expected, answer }, ctx),
      )
      expect(got).toEqual([type, type, type])
    })
  }
})

describe('classifyMistake — 판정하지 않는 경우', () => {
  it('정답이면 null', () => {
    expect(classifyMistake({ headword: '構成', expected: 'こうせい', answer: 'こうせい' }, ctx)).toBeNull()
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: 'ガッコウ' }, ctx)).toBeNull()
  })

  it('빈 입력이면 null', () => {
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: '' }, ctx)).toBeNull()
  })

  it('어느 유형에도 안 맞는 오답이면 null — 억지로 붙이지 않는다', () => {
    expect(classifyMistake({ headword: '学校', expected: 'がっこう', answer: 'あいうえお' }, ctx)).toBeNull()
  })

  it('koSiblingOnyomi 를 안 주면 KO_INTERFERENCE 판정을 건너뛴다', () => {
    const bare: MistakeContext = { lookup: (k) => KANJI_FIXTURE[k] }
    expect(classifyMistake({ headword: '認識', expected: 'にんしき', answer: 'にんしょく' }, bare)).toBeNull()
  })
})

describe('classifyMistake — 경계 규칙', () => {
  it('답이 일본어로 파싱되면 KO_INTERFERENCE 로 가지 않는다', () => {
    // 発端 → はつたん 의 はつ 는 発 자신의 음독이다. PLAN §6 표대로 ONYOMI_CHOICE
    expect(classifyMistake({ headword: '発端', expected: 'ほったん', answer: 'はつたん' }, ctx))
      .toBe('ONYOMI_CHOICE')
  })

  it('促音便 실패에 딸려온 半濁音은 별개 오답으로 세지 않는다', () => {
    // はっぴょう → はつひょう 의 원인은 促音 하나다
    expect(classifyMistake({ headword: '発表', expected: 'はっぴょう', answer: 'はつひょう' }, contextFor({
      ...KANJI_FIXTURE,
      表: { onyomi: ['ヒョウ'], kunyomi: ['おもて', 'あらわ.す'], koreanH: ['표'] },
    }))).toBe('SOKUON')
  })

  it('원형이 장음 유무로만 갈리면 ONYOMI_CHOICE 가 아니라 CHOON', () => {
    // 数 는 ス 도 실재 음독이라 분해는 성공한다. 그래도 진단은 장음 누락이다
    expect(classifyMistake({ headword: '数字', expected: 'すうじ', answer: 'すじ' }, ctx)).toBe('CHOON')
  })
})

// 축약 고정본이 아니라 전체 KANJIDIC2 로도 같은 결과가 나오는지 본다
const kanjiPath = join('data', 'dict', 'kanji.json')
describe.runIf(existsSync(kanjiPath))('전체 KANJIDIC2 (data/dict/kanji.json)', () => {
  const kanji = JSON.parse(readFileSync(kanjiPath, 'utf8')).kanji
  const full = contextFor(kanji)

  it('고정본과 같은 판정을 낸다', () => {
    for (const [type, cases] of Object.entries(CASES) as [MistakeType, Case[]][]) {
      for (const [headword, expected, answer] of cases) {
        expect(classifyMistake({ headword, expected, answer }, full), `${headword} ${answer}`).toBe(type)
      }
    }
  })

  it('한자 1,000개 표본에 대해 예외 없이 판정한다', () => {
    const chars = Object.keys(kanji).slice(0, 1000)
    for (const c of chars) {
      expect(() => classifyMistake({ headword: c, expected: 'あ', answer: 'い' }, full)).not.toThrow()
    }
  })
})

/**
 * RENDAKU 바구니 안의 갈래 판정 (2026-09-17).
 *
 * 분류기가 세 현상을 한 유형으로 묶는 건 진단 축으로 맞지만, 학습자에게 보여줄 규칙은
 * 셋이 다르다. 出発을 しゅっはつ 로 쓴 사람에게 연탁 설명을 내밀면 틀린 규칙을 가르친다.
 */
describe('explainMistake — 탁음 갈래를 가른다', () => {
  it('연탁 — 뒷 글자 첫소리가 탁해지는 자리', () => {
    expect(explainMistake({ headword: '三日月', expected: 'みかづき', answer: 'みかつき' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })

  it('반탁 — っ·ん 뒤에서 は행이 ぱ행이 되는 자리', () => {
    expect(explainMistake({ headword: '心配', expected: 'しんぱい', answer: 'しんはい' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'handaku' })
  })

  it('연성 — ん 뒤의 모음이 な행으로 당겨지는 자리', () => {
    expect(explainMistake({ headword: '天皇', expected: 'てんのう', answer: 'てんおう' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'renjo' })
  })

  /**
   * 反応 은 연성이지만 **앱은 연성으로 안 본다** (2026-09-17, 문법 노출 점검 축 B).
   *
   * KANJIDIC 이 応의 읽기로 `-ノウ` 를 이미 싣는다 — 어휘화가 깊어 별도 읽기가 된 것이다.
   * 그래서 분해가 のう 를 변형 없는 원형으로 읽고, はんおう 는 「다른 음독을 골랐다」가 된다.
   * 전에는 픽스처에서 `-ノウ` 를 빼고 검증해서 **실재하지 않는 경로를 통과시키고 있었다.**
   * 규칙 본문도 이 사실을 적는다 (`rules.ts` 연성 절 `offRule`).
   */
  it('사전이 결과형을 별도 읽기로 실은 연성은 음독 선택으로 간다 — 反応', () => {
    expect(explainMistake({ headword: '反応', expected: 'はんのう', answer: 'はんおう' }, ctx))
      .toEqual({ type: 'ONYOMI_CHOICE', voicing: null })
  })

  it('분해가 안 되는 답도 は행 ↔ ぱ행이면 반탁으로 가른다', () => {
    // 한자 읽기를 모르면 문자열 경로로 떨어진다. 그래도 갈래는 글자가 말해준다
    const bare: MistakeContext = { lookup: () => undefined }
    expect(explainMistake({ headword: '心配', expected: 'しんぱい', answer: 'しんはい' }, bare))
      .toEqual({ type: 'RENDAKU', voicing: 'handaku' })
    expect(explainMistake({ headword: '三日月', expected: 'みかづき', answer: 'みかつき' }, bare))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })

  it('RENDAKU 가 아니면 갈래는 비어 있다', () => {
    expect(explainMistake({ headword: '発達', expected: 'はったつ', answer: 'はつたつ' }, ctx))
      .toEqual({ type: 'SOKUON', voicing: null })
    expect(explainMistake({ headword: '学校', expected: 'がっこう', answer: 'がっこう' }, ctx))
      .toEqual({ type: null, voicing: null })
  })

  it('판정 자체는 classifyMistake 와 언제나 같다 — 진단 축은 안 바뀐다', () => {
    for (const [type, cases] of Object.entries(CASES) as [MistakeType, Case[]][]) {
      for (const [headword, expected, answer] of cases) {
        const input = { headword, expected, answer }
        expect(explainMistake(input, ctx).type, `${headword} ${answer}`).toBe(classifyMistake(input, ctx))
        expect(explainMistake(input, ctx).type).toBe(type)
      }
    }
  })
})

/**
 * 탁음이 어긋났다고 다 연탁이 아니다 (2026-09-17, 사용자 지적).
 *
 * 문자열 경로는 `unvoiceAll` 만 보고 판정해서, **원형부터 탁음인 한자**(額 = がく, 청음
 * かく 가 없다)를 청음으로 쓴 답까지 연탁으로 보냈다. 규칙 배지가 엉뚱한 절을 가리킨다.
 */
describe('정답에 변형이 안 걸렸으면 연탁이 아니다', () => {
  it('원형이 이미 탁음인 자리 — 月額 げつがく ← げつかく', () => {
    // 額의 음독은 ガク 하나뿐이다. 연탁이 일어날 청음 원형이 없다
    expect(explainMistake({ headword: '月額', expected: 'げつがく', answer: 'げつかく' }, ctx))
      .toEqual({ type: null, voicing: null })
  })

  it('같은 한자를 쓰는 다른 숙어도 — 金額 きんがく ← きんかく', () => {
    expect(explainMistake({ headword: '金額', expected: 'きんがく', answer: 'きんかく' }, ctx))
      .toEqual({ type: null, voicing: null })
  })

  it('진짜 연탁은 답이 분해 안 돼도 그대로 잡는다 — 近所 きんじょ ← きんちょ', () => {
    // ちょ 는 所의 읽기가 아니라 답이 분해되지 않는다. 그래도 정답 쪽 しょ→じょ 가 연탁이다
    expect(explainMistake({ headword: '近所', expected: 'きんじょ', answer: 'きんちょ' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })
})

/**
 * 가리는 건 「규칙을 놓친 방향」뿐이다 (2026-09-17, 사용자 지적 「愛好도 연탁이 맞나」).
 *
 * 정답이 청음인데 답이 탁음이면 **정답에 변형이 없다는 것이 곧 오답의 내용**이다 —
 * 규칙을 걸면 안 되는 자리에 걸었다. 여기까지 가리면 과잉 적용을 통째로 잃는다.
 */
describe('과잉 적용 방향도 판정이 죽지 않는다', () => {
  // 2026-09-18 — 갈래는 「청탁 미구분」으로 갈렸지만(아래 절) **유형은 그대로다.**
  // 92e7381 이 지키려던 건 유형이 사라지지 않는 것이었고, 그건 여기서 계속 지킨다
  it('정답이 청음인데 답이 탁음 — 愛好 あいこう ← あいごう', () => {
    expect(explainMistake({ headword: '愛好', expected: 'あいこう', answer: 'あいごう' }, ctx).type)
      .toBe('RENDAKU')
  })

  it('답이 분해 안 되는 과잉 적용도 — 悪化 あっか ← あっが', () => {
    // っ 뒤에 탁음은 올 수 없어 답이 분해되지 않는다. 그래도 탁음을 덧댄 오답이다
    expect(explainMistake({ headword: '悪化', expected: 'あっか', answer: 'あっが' }, ctx).type)
      .toBe('RENDAKU')
  })
})

/**
 * 「청탁 미구분」 — 규칙이 아니라 원형이 그런 자리 (2026-09-18, 사용자 결정).
 *
 * 정답 조각이 **음독인데 탁음 변형이 안 걸렸다**면 그 글자의 청탁은 규칙이 아니라 원형이다
 * (好 = コウ, 額 = ガク). 한국 한자음은 청탁을 안 가르니 학습자에게 단서가 없다 — 연탁을
 * 과하게 쓴 게 아니라 **애초에 규칙이 없는 자리**라, 연탁 절을 내밀면 틀린 규칙을 가르친다.
 *
 * 저장되는 유형(`RENDAKU`)은 안 바뀐다. 갈래만 갈라 이름과 절을 맞춘다.
 */
describe('청탁 미구분 — 음독이고 변형이 없는 자리', () => {
  it('음독 + 변형 없음 → unmarked (愛好 あいこう ← あいごう)', () => {
    expect(explainMistake({ headword: '愛好', expected: 'あいこう', answer: 'あいごう' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'unmarked' })
  })

  it('답이 분해 안 되는 자리도 (悪化 あっか ← あっが) — っ 뒤엔 탁음이 못 온다', () => {
    expect(explainMistake({ headword: '悪化', expected: 'あっか', answer: 'あっが' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'unmarked' })
  })

  it('**훈독은 연탁 그대로** (春風 はるかぜ ← はるがぜ) — 라이먼의 법칙이 막는 진짜 과잉 적용', () => {
    expect(explainMistake({ headword: '春風', expected: 'はるかぜ', answer: 'はるがぜ' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
  })

  it('정답에 변형이 걸린 자리는 그대로 연탁/반탁이다', () => {
    expect(explainMistake({ headword: '三日月', expected: 'みかづき', answer: 'みかつき' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'rendaku' })
    expect(explainMistake({ headword: '心配', expected: 'しんぱい', answer: 'しんはい' }, ctx))
      .toEqual({ type: 'RENDAKU', voicing: 'handaku' })
  })
})
