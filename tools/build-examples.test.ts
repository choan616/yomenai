// pickExamples·readingHolds 단위 테스트 — 길이 상한 필터 + 짧은 순 정렬 + 중복 제거 + 읽기 검증
import { describe, expect, it } from 'vitest'
import {
  buriedInProperNoun,
  blockedInName,
  pickExamples,
  readingHolds,
} from './build-examples.ts'

describe('pickExamples', () => {
  it('짧은 순으로 최대 max 개를 고른다', () => {
    const got = pickExamples(['ccc', 'a', 'bb'], 2)
    expect(got).toEqual(['a', 'bb'])
  })

  it('길이 상한을 넘는 문장은 뺀다', () => {
    const got = pickExamples(['短い文', 'とても長くて読みにくい可能性がある例文です'], 3, 5)
    expect(got).toEqual(['短い文'])
  })

  it('중복 문장은 한 번만 센다', () => {
    const got = pickExamples(['同じ文', '同じ文', '同じ文'], 3)
    expect(got).toEqual(['同じ文'])
  })

  it('후보가 없으면 빈 배열', () => {
    expect(pickExamples([])).toEqual([])
  })

  it('전부 상한을 넘으면 빈 배열 — 억지로 긴 문장을 끼워넣지 않는다', () => {
    expect(pickExamples(['아주 긴 문장입니다 매우 매우 매우 깁니다'], 3, 5)).toEqual([])
  })
})

describe('pickExamples — accept', () => {
  it('accept 가 거른 문장은 건너뛰고 다음 후보로 채운다', () => {
    const got = pickExamples(['aa', 'bb', 'cc'], 2, 10, (s) => s !== 'aa')
    expect(got).toEqual(['bb', 'cc'])
  })

  it('max 를 채우면 남은 후보는 검사하지 않는다 — 형태소 분석이 비싸다', () => {
    const seen: string[] = []
    pickExamples(['a', 'bb', 'ccc'], 1, 10, (s) => {
      seen.push(s)
      return true
    })
    expect(seen).toEqual(['a'])
  })
})

describe('readingHolds', () => {
  it('日照り(ヒデリ) 안의 日照 는 にっしょう 로 안 읽힌다', () => {
    const ms = [{ position: 0, surface: '日照り', reading: 'ヒデリ' }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })

  it('日照時間 의 日照 는 살린다 — 형태소가 갈라지고 읽기가 그대로다', () => {
    const ms = [
      { position: 0, surface: '日照', reading: 'ニッショウ' },
      { position: 2, surface: '時間', reading: 'ジカン' },
    ]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(true)
  })

  it('弁護士(ベンゴシ) 한 덩어리 안의 弁護 는 살린다 — 읽기가 보존된다', () => {
    const ms = [{ position: 0, surface: '弁護士', reading: 'ベンゴシ' }]
    expect(readingHolds(ms, 0, '弁護', 'べんご')).toBe(true)
  })

  it('国家/主義 경계에 걸친 家主 는 뺀다', () => {
    const ms = [
      { position: 0, surface: '国家', reading: 'コッカ' },
      { position: 2, surface: '主義', reading: 'シュギ' },
    ]
    expect(readingHolds(ms, 1, '家主', 'やぬし')).toBe(false)
  })

  it('구간 밖 형태소의 읽기는 안 센다', () => {
    const ms = [
      { position: 0, surface: '不作', reading: 'フサク' },
      { position: 2, surface: 'は', reading: 'ハ' },
      { position: 3, surface: '日照', reading: 'ニッショウ' },
    ]
    expect(readingHolds(ms, 3, '日照', 'にっしょう')).toBe(true)
  })

  it('표기가 통째로 안 맞는 형태소가 읽기까지 없으면 판정하지 않고 뺀다', () => {
    const ms = [{ position: 0, surface: '日照り', reading: undefined }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 음운 변형과 경계', () => {
  it('IPADIC 이 一/回 로 갈라 イチ+カイ 를 줘도 いっかい 로 본다 (促音便)', () => {
    const ms = [
      { position: 0, surface: '一', reading: 'イチ' },
      { position: 1, surface: '回', reading: 'カイ' },
    ]
    expect(readingHolds(ms, 0, '一回', 'いっかい')).toBe(true)
  })

  it('稲妻 イナヅマ 와 いなずま 는 現代仮名遣い 차이일 뿐이다', () => {
    const ms = [{ position: 0, surface: '稲妻', reading: 'イナヅマ' }]
    expect(readingHolds(ms, 0, '稲妻', 'いなずま')).toBe(true)
  })

  it('万一|戦争 에 걸친 一戦 은 양쪽 끝이 다 형태소 중간이라 뺀다', () => {
    const ms = [
      { position: 0, surface: '万一', reading: 'マンイチ' },
      { position: 2, surface: '戦争', reading: 'センソウ' },
    ]
    expect(readingHolds(ms, 1, '一戦', 'いっせん')).toBe(false)
  })

  it('걸치는 형태소가 없으면 false — 자리를 잘못 받은 경우', () => {
    const ms = [{ position: 0, surface: '猫', reading: 'ネコ' }]
    expect(readingHolds(ms, 5, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 동형이독', () => {
  it('형태소 하나와 표기가 통째로 맞으면 IPADIC 이 다른 읽기를 줘도 받는다 (日本人 ニッポンジン)', () => {
    const ms = [{ position: 0, surface: '日本人', reading: 'ニッポンジン' }]
    expect(readingHolds(ms, 0, '日本人', 'にほんじん')).toBe(true)
  })

  it('표기가 더 긴 형태소면 통째 일치가 아니라 읽기로 판정한다 (日照り)', () => {
    const ms = [{ position: 0, surface: '日照り', reading: 'ヒデリ' }]
    expect(readingHolds(ms, 0, '日照', 'にっしょう')).toBe(false)
  })
})

describe('readingHolds — 읽기를 모르는 형태소', () => {
  it('표기가 통째로 맞으면 읽기를 몰라도 받는다 — 未知語여도 그 단어가 거기 있다 (拒食症)', () => {
    const ms = [{ position: 0, surface: '拒食症', reading: undefined }]
    expect(readingHolds(ms, 0, '拒食症', 'きょしょくしょう')).toBe(true)
  })
})

describe('buriedInProperNoun — 이름 안에 파묻힌 표기 (2026-09-21 사용자 지적)', () => {
  /** 고유명사 한 덩어리 */
  const propn = (surface: string) => [{ position: 0, surface, propn: true }]

  it('和歌山(지명) 안의 和歌 는 뺀다 — 읽기는 맞지만 뜻이 다르다', () => {
    expect(buriedInProperNoun(propn('和歌山'), 0, '和歌')).toBe(true)
  })

  it('協和銀行 안의 協和 도 같다', () => {
    expect(buriedInProperNoun(propn('協和銀行'), 0, '協和')).toBe(true)
  })

  it('最高裁 안의 高裁 는 자동으로는 안 막힌다 — 뒤쪽이라 수동 목록의 몫이다', () => {
    expect(buriedInProperNoun(propn('最高裁'), 1, '高裁')).toBe(false)
  })

  it('표제어 자체가 고유명사면 파묻힌 게 아니다 — 안 그러면 예문을 영영 못 갖는다', () => {
    expect(buriedInProperNoun(propn('東京'), 0, '東京')).toBe(false)
  })

  it('이름 뒤쪽에서 끝나는 표기는 살린다 — アルプス山脈 의 山脈 은 산맥이 맞다', () => {
    expect(buriedInProperNoun(propn('アルプス山脈'), 4, '山脈')).toBe(false)
  })

  it('가운데 낀 것은 막는다 — 東京都庁 의 京都', () => {
    expect(buriedInProperNoun(propn('東京都庁'), 1, '京都')).toBe(true)
  })

  it('보통명사 안에 든 것은 안 건드린다 — 읽기 검증의 몫이다', () => {
    const m = [{ position: 0, surface: '弁護士', propn: false }]
    expect(buriedInProperNoun(m, 0, '弁護')).toBe(false)
  })

  it('고유명사가 표제어 구간을 다 못 덮으면 아니다 — 経済/産業省 에 걸친 済産', () => {
    const m = [
      { position: 0, surface: '経済', propn: false },
      { position: 2, surface: '産業省', propn: true },
    ]
    expect(buriedInProperNoun(m, 1, '済産')).toBe(false)
  })
})

describe('blockedInName — 손으로 적어 둔 제외 (2026-09-21)', () => {
  const blocked = { 協和銀行: ['協和'], 最高裁: ['高裁'] }
  const S = '１０年前に協和銀行と埼玉銀行は合併してあさひ銀行になった。'

  it('協和銀行 안의 協和 는 막는다 — IPADIC 은 協和+銀行 으로 갈라 고유명사 표시가 없다', () => {
    expect(blockedInName(S, S.indexOf('協和'), '協和', blocked)).toBe(true)
  })

  it('같은 자리의 銀行 은 살린다 — 회사 이름 안이어도 은행은 은행이다 (사용자 지적)', () => {
    expect(blockedInName(S, S.indexOf('銀行'), '銀行', blocked)).toBe(false)
  })

  it('뒤쪽이라 자동으로는 풀리는 最高裁 의 高裁 를 여기서 막는다', () => {
    expect(blockedInName('最高裁が人種分離教育を攻撃。', 1, '高裁', blocked)).toBe(true)
  })

  it('그 이름이 문장에 없으면 안 막는다 — 高裁 단독은 그대로다', () => {
    expect(blockedInName('高裁の判断を仰ぐ。', 0, '高裁', blocked)).toBe(false)
  })

  it('목록이 비면 아무것도 안 막는다', () => {
    expect(blockedInName(S, S.indexOf('協和'), '協和', {})).toBe(false)
  })
})

describe('연탁 지우기는 형태소 경계에 맞을 때만 (2026-09-26)', () => {
  // 大家 의 예문으로 大家族 이 붙어 있었다 (사용자 지적). 大(ダイ)|家族(カゾク) 로 갈려
  // 표제어 오른쪽 끝이 家族 한가운데를 자르는데, 연탁을 지우면 だいかぞく → たいかそく 가
  // 되어 たいか 를 품는다. 그 자리에 大家 라는 단어는 없다
  it('大家族 안의 大家 는 たいか 로 안 읽힌다', () => {
    const ms = [
      { position: 0, surface: '大', reading: 'ダイ' },
      { position: 1, surface: '家族', reading: 'カゾク' },
    ]
    expect(readingHolds(ms, 0, '大家', 'たいか')).toBe(false)
  })

  it('裁判官 안의 判官 도 마찬가지다', () => {
    const ms = [
      { position: 0, surface: '裁判', reading: 'サイバン' },
      { position: 2, surface: '官', reading: 'カン' },
    ]
    expect(readingHolds(ms, 1, '判官', 'はんがん')).toBe(false)
  })

  // 끝이 경계에 맞으면 연탁은 그 자리에서 일어나는 변형이라 지울 근거가 있다
  it('雪合戦 의 合戦(がっせん) 은 かっせん 으로 살린다', () => {
    const ms = [
      { position: 0, surface: '雪', reading: 'ユキ' },
      { position: 1, surface: '合戦', reading: 'ガッセン' },
    ]
    expect(readingHolds(ms, 1, '合戦', 'かっせん')).toBe(true)
  })

  // 촉음 융합은 경계를 안 자를 때도 필요하다 — 양쪽 다 지운다
  it('一(イチ)|回(カイ) 의 一回(いっかい) 는 살린다', () => {
    const ms = [
      { position: 0, surface: '一', reading: 'イチ' },
      { position: 1, surface: '回', reading: 'カイ' },
    ]
    expect(readingHolds(ms, 0, '一回', 'いっかい')).toBe(true)
  })

  it('論文|中 의 文中 은 그대로 살린다 — 왼쪽만 자르고 읽기가 보존된다', () => {
    const ms = [
      { position: 0, surface: '論文', reading: 'ロンブン' },
      { position: 2, surface: '中', reading: 'チュウ' },
    ]
    expect(readingHolds(ms, 1, '文中', 'ぶんちゅう')).toBe(true)
  })
})

describe('형태소 꼬리면 연탁을 지운다 (2026-09-26)', () => {
  // 연탁은 뒷요소의 첫소리에 일어난다 — 표제어가 형태소의 꼬리면 그 탁음은 표제어 자신의 변형이다
  it('雪合戦 한 덩이 안의 合戦(がっせん) 도 살린다', () => {
    const ms = [{ position: 0, surface: '雪合戦', reading: 'ユキガッセン' }]
    expect(readingHolds(ms, 1, '合戦', 'かっせん')).toBe(true)
  })

  it('和菓子 안의 菓子, 居酒屋 안의 酒屋 도 살린다', () => {
    expect(
      readingHolds([{ position: 0, surface: '和菓子', reading: 'ワガシ' }], 1, '菓子', 'かし'),
    ).toBe(true)
    expect(
      readingHolds([{ position: 0, surface: '居酒屋', reading: 'イザカヤ' }], 1, '酒屋', 'さかや'),
    ).toBe(true)
  })

  it('**앞부분은 아니다** — 大家族 의 だ 는 大家 가 연탁한 게 아니라 大 의 제 음이다', () => {
    const ms = [{ position: 0, surface: '大家族', reading: 'ダイカゾク' }]
    expect(readingHolds(ms, 0, '大家', 'たいか')).toBe(false)
  })
})
