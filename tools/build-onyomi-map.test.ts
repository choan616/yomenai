// 음독 분해의 대표 케이스, 매핑 실패율 스냅샷, 음독 그래프 순환 부재를 검증하는 테스트
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { decompose, type KanjiReadings } from './lib/onyomi.ts'
import { buildMap, findCycles, findVariantCycles } from './build-onyomi-map.ts'

const kanjiPath = join(DICT_DIR, 'kanji.json')
const idiomsPath = join(DICT_DIR, 'idioms.json')
const hasDict = existsSync(kanjiPath) && existsSync(idiomsPath)

const kanji: Record<string, KanjiReadings> = hasDict
  ? JSON.parse(readFileSync(kanjiPath, 'utf8')).kanji
  : {}
const lookup = (k: string) => kanji[k]

/** 분해 결과를 `한자=표면형:원형/변형` 로 납작하게 편다 */
function flat(headword: string, reading: string): string {
  const d = decompose(headword, reading, lookup)
  if (!d.ok) return `✗${d.reason}`
  return d.segments
    .map((s) => `${s.kanji}=${s.surface}:${s.base}${s.variants.length ? '/' + s.variants.join('+') : ''}`)
    .join(' ')
}

describe.runIf(hasDict)('decompose — 음운 변형 규칙별 대표 케이스', () => {
  it('변형 없는 음독 복합어', () => {
    expect(flat('構成', 'こうせい')).toBe('構=こう:こう 成=せい:せい')
    expect(flat('定款', 'ていかん')).toBe('定=てい:てい 款=かん:かん')
    expect(flat('生殺与奪', 'せいさつよだつ')).toBe('生=せい:せい 殺=さつ:さつ 与=よ:よ 奪=だつ:だつ')
  })

  it('促音便 — 말미 く/つ/ち 가 っ 로', () => {
    expect(flat('学校', 'がっこう')).toBe('学=がっ:がく/sokuon 校=こう:こう')
    expect(flat('発達', 'はったつ')).toBe('発=はっ:はつ/sokuon 達=たつ:たつ')
    expect(flat('一体', 'いったい')).toBe('一=いっ:いち/sokuon 体=たい:たい')
  })

  it('半濁音 — っ·ん 뒤 は행이 ぱ행으로', () => {
    expect(flat('発表', 'はっぴょう')).toBe('発=はっ:はつ/sokuon 表=ぴょう:ひょう/handaku')
    expect(flat('心配', 'しんぱい')).toBe('心=しん:しん 配=ぱい:はい/handaku')
  })

  it('連濁 — 비어두 청음이 탁음으로', () => {
    expect(flat('三日月', 'みかづき')).toBe('三=み:み 日=か:か 月=づき:つき/rendaku')
    expect(flat('人々', 'ひとびと')).toBe('人=ひと:ひと 人=びと:ひと/rendaku')
    expect(flat('鼻血', 'はなぢ')).toBe('鼻=はな:はな 血=ぢ:ち/rendaku')
    // 現代仮名遣い에서 ち 의 連濁는 ぢ 와 じ 로 갈린다
    expect(flat('年中', 'ねんじゅう')).toBe('年=ねん:ねん 中=じゅう:ちゅう/rendaku')
  })

  it('連声 — ん 뒤 あ행이 な행으로', () => {
    expect(flat('反応', 'はんのう')).toBe('反=はん:はん 応=のう:のう')
    expect(flat('観音', 'かんのん')).toBe('観=かん:かん 音=のん:のん')
  })

  it('促音添加 — 접두 훈독 뒤에 っ 가 덧붙는다', () => {
    expect(flat('真白', 'まっしろ')).toBe('真=まっ:ま/sokuon 白=しろ:しろ')
    expect(flat('真最中', 'まっさいちゅう')).toBe('真=まっ:ま/sokuon 最=さい:さい 中=ちゅう:ちゅう')
  })

  it('々 는 직전 한자의 반복으로 편다', () => {
    expect(flat('段々', 'だんだん')).toBe('段=だん:だん 段=だん:だん')
    expect(flat('島々', 'しまじま')).toBe('島=しま:しま 島=じま:しま/rendaku')
  })

  it('연용형 흡수 — 오쿠리가나 없는 표기에서 한자가 연용형 전체를 덮는다', () => {
    expect(flat('買取', 'かいとり')).toBe('買=かい:かい 取=とり:とり')
    expect(flat('取引', 'とりひき')).toBe('取=とり:とり 引=ひき:ひき')
    expect(flat('手続', 'てつづき')).toBe('手=て:て 続=つづき:つづき')
    expect(flat('割引', 'わりびき')).toBe('割=わり:わり 引=びき:ひき/rendaku')
    // 희귀 읽기(出 の い.でる)로 갈리지 않고 통용 읽기 쪽으로 붙는다
    expect(flat('思出', 'おもいで')).toBe('思=おもい:おもい 出=で:で')
  })

  it('탁음 접미형은 청음 대표형으로 모은다 — 音독 숙달 집계가 쪼개지지 않게', () => {
    expect(flat('引金', 'ひきがね')).toBe('引=ひき:ひき 金=がね:かね/rendaku')
    expect(flat('浮彫', 'うきぼり')).toBe('浮=うき:うき 彫=ぼり:ほり/rendaku')
  })

  it('음독의 呉音/漢音 쌍은 連濁로 병합하지 않는다', () => {
    // 次 の ジ 는 シ 의 탁음화가 아니라 별개 읽기다
    expect(flat('目次', 'もくじ')).toBe('目=もく:もく 次=じ:じ')
    expect(flat('次第', 'しだい')).toBe('次=し:し 第=だい:だい')
  })

  it('重箱·湯桶 읽기를 음훈 혼독으로 표시한다', () => {
    const juu = decompose('重箱', 'じゅうばこ', lookup)
    const yu = decompose('湯桶', 'ゆとう', lookup)
    expect(juu.ok && juu.mixed).toBe(true)
    expect(yu.ok && yu.mixed).toBe(true)
  })

  it('熟字訓·当て字는 분해하지 않고 실패로 남긴다', () => {
    // 억지로 쪼개면 존재하지 않는 음독을 학습시키게 된다
    for (const [h, r] of [['大人', 'おとな'], ['昨日', 'きのう'], ['梅雨', 'つゆ'], ['為替', 'かわせ'], ['時計', 'とけい']]) {
      expect(flat(h, r)).toBe('✗NO_PARSE')
    }
  })

  it('카타카나 읽기(외래어 当て字)는 별도 사유로 거른다', () => {
    expect(flat('硝子', 'ガラス')).toBe('✗KATAKANA_READING')
  })
})

describe.runIf(hasDict)('전체 코퍼스 매핑 (data/dict)', () => {
  const { idioms } = JSON.parse(readFileSync(idiomsPath, 'utf8')) as { idioms: IdiomRecord[] }
  const built = buildMap(idioms, kanji)

  it('매핑 실패율 스냅샷', () => {
    expect(built.stats.total).toBe(107532)
    expect(built.stats.ok).toBe(103172)
    expect(built.stats.byReason).toEqual({
      KATAKANA_READING: 522,
      UNKNOWN_KANJI: 0,
      NO_PARSE: 3838,
      BUDGET: 0,
    })
  })

  it('학습 대상(밴드 0~3) 실패율은 2% 미만이다', () => {
    for (const b of ['0', '1', '2', '3']) {
      const s = built.stats.byBand[b]
      expect(s.failed / s.total).toBeLessThan(0.02)
    }
  })

  it('탐색 예산 초과가 없다 — 조용한 오분해가 생기지 않았다', () => {
    expect(built.stats.byReason.BUDGET).toBe(0)
  })

  it('숙어 → (한자, 읽기) 이분 그래프에 순환이 없다', () => {
    expect(findCycles(built.byIdiom)).toEqual([])
  })

  it('변형 파생 그래프(連濁·促音便·半濁·連声)에 순환이 없다', () => {
    expect(findVariantCycles([...built.pairs.values()].map((p) => p.base))).toEqual([])
  })

  it('분해된 표면형을 이으면 원래 읽기가 그대로 복원된다', () => {
    const byId = new Map(idioms.map((i) => [i.id, i]))
    for (const [id, segs] of Object.entries(built.byIdiom)) {
      expect(segs.map((s) => s[1]).join('')).toBe(byId.get(id)!.reading)
    }
  })
})
