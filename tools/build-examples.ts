// 학습 대상 숙어에 붙일 무번역 예문(일본어)을 Tatoeba 문장에서 골라 data/dict/examples.json 을 만든다.
// 채택 근거 — measure-tatoeba.ts 실측(밴드 0~3 표기 매칭 66.6%, 한국어 번역 연결 0.9%)과
// 사용자 확인(context-notes 2026-09-04 절). 번역이 없어 확인 단계(교정 카드 피드백) 참고용으로만
// 쓴다 — TTS 와 같은 자리다.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { bandOf } from '../src/lib/bands.ts'
import { DICT_DIR, type IdiomRecord } from './lib/dict.ts'
import { readJapaneseSentences } from './lib/tatoeba.ts'

const MAX_PER_IDIOM = 3
/** 카드에 얹기엔 너무 긴 문장은 후보에서 뺀다 */
const MAX_LEN = 60

/** 후보 중 길이 상한을 통과한 것만, 짧은(=쉬운) 순으로 최대 max 개 고른다. 순수 함수라 단위 테스트가 붙는다 */
export function pickExamples(candidates: string[], max = MAX_PER_IDIOM, maxLen = MAX_LEN): string[] {
  return [...new Set(candidates)]
    .filter((s) => s.length <= maxLen)
    .sort((a, b) => a.length - b.length)
    .slice(0, max)
}

function main() {
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

  const byId: Record<string, string[]> = {}
  let idiomsWithExamples = 0
  let totalSentences = 0
  for (const [id, cands] of candidatesOf) {
    const picked = pickExamples(cands)
    if (picked.length === 0) continue
    byId[id] = picked
    idiomsWithExamples++
    totalSentences += picked.length
  }

  const out = {
    _meta: {
      source: 'Tatoeba (tatoeba.org). CC BY, 문장 작성자별 저작권 — 개인 사용 단계라 출처만 기록',
      rule: `표제어 문자열 매칭(읽기 미검증), ${MAX_LEN}자 이하 중 짧은 순 최대 ${MAX_PER_IDIOM}개`,
      generatedAt: new Date().toISOString(),
      idiomCount: pool.length,
      idiomsWithExamples,
      totalSentences,
    },
    byId,
  }
  writeFileSync(join(DICT_DIR, 'examples.json'), JSON.stringify(out))
  console.log(
    `data/dict/examples.json — 숙어 ${idiomsWithExamples}/${pool.length}` +
      `(${((idiomsWithExamples / pool.length) * 100).toFixed(1)}%), 문장 ${totalSentences}개`,
  )
}

if (import.meta.filename === process.argv[1]) main()
