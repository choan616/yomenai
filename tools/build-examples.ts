// 학습 대상 숙어에 붙일 무번역 예문(일본어)을 Tatoeba 문장에서 골라 data/dict/examples.json 을 만든다.
// 채택 근거 — measure-tatoeba.ts 실측(밴드 0~3 표기 매칭 66.6%, 한국어 번역 연결 0.9%)과
// 사용자 확인(context-notes 2026-09-04 절). 번역이 없어 확인 단계(교정 카드 피드백) 참고용으로만
// 쓴다 — TTS 와 같은 자리다.
// 표기만 맞으면 日照 예문에 日照り(ひでり)가 실린다. 그래서 형태소 분석으로 읽기까지 검증한다
// (context-notes 2026-09-18 절).
// 읽기가 맞아도 뜻이 안 맞는 자리가 남는다 — 和歌山 의 和歌, 協和銀行 의 協和 처럼 표제어가
// 고유명사 이름 안에 파묻힌 경우다. 읽기는 보존되므로 읽기 검증으로는 못 거른다
// (사용자 지적 2026-09-21).
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import kuromoji from 'kuromoji'
import { toHiragana, unvoiceAll } from '../src/lib/readings.ts'
import { bandOf } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { readJapaneseSentences } from './lib/tatoeba.ts'

const MAX_PER_IDIOM = 3
/** 카드에 얹기엔 너무 긴 문장은 후보에서 뺀다 */
const MAX_LEN = 60

/** 형태소 하나 — 검증 함수에 kuromoji 를 끌고 들어오지 않으려고 필요한 것만 추린다. position 은 0-based */
export interface Morpheme {
  position: number
  surface: string
  reading?: string
  /** IPADIC 품사세분류1 이 固有名詞 인가 (아래 `buriedInProperNoun`) */
  propn?: boolean
}

/** 促音便이 일어난 자리를 되짚을 때 っ 뒤에 올 수 있는 무성 자음 행 */
const AFTER_SOKUON_HEAD = new Set([...'かきくけこさしすせそたちつてとはひふへほ'])

/**
 * 형태소 읽기와 표제어 읽기를 같은 자리에 놓는다. IPADIC 은 一/回 를 갈라 イチ+カイ 로 주는데
 * 표제어 읽기는 융합형 いっかい 라 그대로는 안 맞는다. 現代仮名遣い(ぢ·づ)·連濁·半濁·促音便을
 * 지우고 비교한다 — 이 차이는 같은 단어 안의 음운 변형이지 다른 읽기가 아니다
 */
function canonicalReading(reading: string): string {
  const plain = unvoiceAll(toHiragana(reading).replace(/ぢ/g, 'じ').replace(/づ/g, 'ず'))
  let out = ''
  for (let i = 0; i < plain.length; i++) {
    const c = plain[i]
    const fuses = 'ちつきくり'.includes(c) && AFTER_SOKUON_HEAD.has(plain[i + 1] ?? '')
    out += fuses ? 'っ' : c
  }
  return out
}

/**
 * 문장 at 자리의 표제어가 정말 그 읽기로 읽히는지 본다. 표제어 구간에 걸치는 형태소들의 읽기를
 * 이어 붙여 표제어 읽기를 품는지로 판정한다 — 弁護士(ベンゴシ) 안의 弁護 는 살리고,
 * 日照り(ヒデリ) 안의 日照 와 国家/主義 에 걸친 家主 는 뺀다. 읽기를 모르는 형태소가 걸치면 뺀다
 */
export function readingHolds(
  morphemes: Morpheme[],
  at: number,
  headword: string,
  reading: string,
): boolean {
  const end = at + headword.length
  const cover = morphemes.filter((m) => m.position < end && m.position + m.surface.length > at)
  if (cover.length === 0) return false
  // 양쪽 끝이 다 형태소 중간이면 단어 경계를 가로지른 우연한 일치다 (万一|戦争 안의 一戦).
  // 한쪽 끝만 중간인 것은 살린다 — 弁護|士 의 弁護, 論文|中 의 文中 은 읽기가 보존된다
  const last = cover[cover.length - 1]
  if (cover[0].position < at && last.position + last.surface.length > end) return false
  // 형태소 하나와 표기가 통째로 맞으면 그 단어가 거기 있는 것이다. 동형이독에서 IPADIC 이 고른 읽기는
  // 문맥 판단이 아니라 기본값일 때가 많아(右腕 ウワン, 日本人 ニッポンジン) 사전 읽기를 뒤집을 근거가 못 된다
  if (cover.length === 1 && cover[0].surface === headword) return true
  let joined = ''
  for (const m of cover) {
    if (m.reading === undefined) return false
    joined += m.reading
  }
  return canonicalReading(joined).includes(canonicalReading(reading))
}

/**
 * 표제어가 **고유명사 하나 안에 통째로 파묻혔나** (2026-09-21 사용자 지적).
 *
 * 和歌山 의 和歌, 協和銀行 의 協和, 最高裁 의 高裁 — 읽기는 그대로라 `readingHolds` 를
 * 통과하지만 그 자리의 뜻은 표제어의 뜻이 아니다. 이름 안에 글자가 우연히 들어간 것이다.
 *
 * 형태소와 표기가 **통째로 같으면 파묻힌 게 아니다** — 東京 처럼 표제어 자체가 고유명사인
 * 경우까지 막으면 그 숙어는 예문을 영영 못 갖는다.
 *
 * 대가 — アルプス山脈 의 山脈, 赤十字 의 十字 처럼 뜻이 살아 있는 것도 같이 빠진다.
 * 이 둘을 자동으로 가를 신호가 없다 (外務省·講談社 둘 다 固有名詞,組織 이다). 실측으로
 * 이런 「좋은 쪽」은 다른 예문을 갖고 있어 빈자리가 안 생긴다는 걸 확인하고 택했다.
 */
export function buriedInProperNoun(
  morphemes: Morpheme[],
  at: number,
  headword: string,
): boolean {
  const end = at + headword.length
  return morphemes.some(
    (m) =>
      m.propn === true &&
      m.surface !== headword &&
      m.position <= at &&
      m.position + m.surface.length >= end,
  )
}

/**
 * 후보 중 길이 상한을 통과하고 accept 가 받아들인 것만, 짧은(=쉬운) 순으로 최대 max 개 고른다.
 * accept 는 형태소 분석이 필요해 비싸므로 짧은 순으로 훑다가 max 개를 채우면 멈춘다. 순수 함수라 단위 테스트가 붙는다
 */
export function pickExamples(
  candidates: string[],
  max = MAX_PER_IDIOM,
  maxLen = MAX_LEN,
  accept: (sentence: string) => boolean = () => true,
): string[] {
  const picked: string[] = []
  const sorted = [...new Set(candidates)]
    .filter((s) => s.length <= maxLen)
    .sort((a, b) => a.length - b.length)
  for (const s of sorted) {
    if (!accept(s)) continue
    picked.push(s)
    if (picked.length === max) break
  }
  return picked
}

/** kuromoji 사전은 패키지 안에 같이 실린다 — 경로를 패키지 위치에서 되짚는다 */
function buildTokenizer(): Promise<kuromoji.Tokenizer<kuromoji.IpadicFeatures>> {
  const require = createRequire(import.meta.url)
  const dicPath = join(dirname(require.resolve('kuromoji')), '..', 'dict')
  return new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, tokenizer) => {
      if (err) reject(err)
      else resolve(tokenizer)
    })
  })
}

async function main() {
  const withBand4 = process.argv.includes('--all')
  const { idioms } = JSON.parse(readFileSync(join(DICT_DIR, 'idioms.json'), 'utf8')) as {
    idioms: IdiomRecord[]
  }
  const pool = withBand4 ? idioms : idioms.filter((it) => bandOf(it) <= 3)
  const sentences = readJapaneseSentences()

  // 표제어 첫 글자로 후보를 좁힌 뒤 startsWith 로 확정 (measure-tatoeba.ts 와 같은 방식)
  const byFirstChar = new Map<string, { id: string; headword: string }[]>()
  for (const it of pool) {
    const key = it.headword[0]
    const list = byFirstChar.get(key)
    if (list) list.push({ id: it.id, headword: it.headword })
    else byFirstChar.set(key, [{ id: it.id, headword: it.headword }])
  }

  const candidatesOf = new Map<string, string[]>()
  for (const s of sentences) {
    const text = s.text
    for (let i = 0; i < text.length; i++) {
      const cands = byFirstChar.get(text[i])
      if (!cands) continue
      for (const c of cands) {
        if (text.startsWith(c.headword, i)) {
          const list = candidatesOf.get(c.id)
          if (list) list.push(text)
          else candidatesOf.set(c.id, [text])
        }
      }
    }
  }

  const tokenizer = await buildTokenizer()
  const byId = new Map(pool.map((it) => [it.id, it]))
  let checked = 0
  let rejected = 0
  let propnRejected = 0
  /** 한 자리라도 표제어 읽기로 읽히면 받는다 — 같은 문장에 표기가 여러 번 나올 수 있다 */
  const verified = (sentence: string, it: IdiomRecord): boolean => {
    checked++
    const morphemes = tokenizer.tokenize(sentence).map((t) => ({
      position: t.word_position - 1,
      surface: t.surface_form,
      reading: t.reading,
      propn: t.pos_detail_1 === '固有名詞',
    }))
    let sawPropn = false
    for (let i = sentence.indexOf(it.headword); i >= 0; i = sentence.indexOf(it.headword, i + 1)) {
      // 이름 안에 파묻힌 자리는 그 자리만 버린다 — 같은 문장 다른 자리에 홀로 서 있을 수 있다
      // (勤労感謝の日 와 勤労の大切さ 가 한 문장에 같이 나온다)
      if (buriedInProperNoun(morphemes, i, it.headword)) {
        sawPropn = true
        continue
      }
      if (readingHolds(morphemes, i, it.headword, it.reading)) return true
    }
    rejected++
    if (sawPropn) propnRejected++
    return false
  }

  const byIdOut: Record<string, string[]> = {}
  let idiomsWithExamples = 0
  let totalSentences = 0
  for (const [id, cands] of candidatesOf) {
    const it = byId.get(id)
    if (!it) continue
    const picked = pickExamples(cands, MAX_PER_IDIOM, MAX_LEN, (s) => verified(s, it))
    if (picked.length === 0) continue
    byIdOut[id] = picked
    idiomsWithExamples++
    totalSentences += picked.length
  }

  const out = {
    _meta: {
      source: 'Tatoeba (tatoeba.org). CC BY, 문장 작성자별 저작권 — 개인 사용 단계라 출처만 기록',
      rule:
        `표제어 문자열 매칭 + 형태소 분석(kuromoji/IPADIC)으로 읽기 검증 및 고유명사 매몰 제외, ` +
        `${MAX_LEN}자 이하 중 짧은 순 최대 ${MAX_PER_IDIOM}개`,
      generatedAt: new Date().toISOString(),
      idiomCount: pool.length,
      idiomsWithExamples,
      totalSentences,
    },
    byId: byIdOut,
  }
  writeFileSync(join(DICT_DIR, 'examples.json'), JSON.stringify(out))
  console.log(
    `data/dict/examples.json — 숙어 ${idiomsWithExamples}/${pool.length}` +
      `(${((idiomsWithExamples / pool.length) * 100).toFixed(1)}%), 문장 ${totalSentences}개`,
  )
  console.log(
    `  읽기 검증 ${checked}문장 검사, ${rejected}개 탈락 (${((rejected / checked) * 100).toFixed(1)}%)` +
      ` — 그중 고유명사 매몰 ${propnRejected}개`,
  )
}

if (import.meta.filename === process.argv[1]) await main()
