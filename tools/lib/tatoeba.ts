// Tatoeba 원본 TSV 공용 파서 — measure-tatoeba.ts 와 build-examples.ts 가 같이 쓴다
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAW_DIR } from './dict.ts'

export const TATOEBA_DIR = join(RAW_DIR, 'tatoeba')

export interface TatoebaSentence {
  id: string
  text: string
}

/** jpn_sentences_detailed.tsv 에서 일본어 문장만 뽑는다 (id, lang, text, author, added, modified) */
export function readJapaneseSentences(): TatoebaSentence[] {
  const raw = readFileSync(join(TATOEBA_DIR, 'jpn_sentences_detailed.tsv'), 'utf8')
  const out: TatoebaSentence[] = []
  for (const line of raw.split('\n')) {
    if (line === '') continue
    const tab1 = line.indexOf('\t')
    const tab2 = line.indexOf('\t', tab1 + 1)
    const tab3 = line.indexOf('\t', tab2 + 1)
    if (tab1 < 0 || tab2 < 0) continue
    const lang = line.slice(tab1 + 1, tab2)
    if (lang !== 'jpn') continue
    const text = tab3 < 0 ? line.slice(tab2 + 1) : line.slice(tab2 + 1, tab3)
    out.push({ id: line.slice(0, tab1), text })
  }
  return out
}

export function countLinks(file: string): number {
  const raw = readFileSync(join(TATOEBA_DIR, file), 'utf8')
  return raw.split('\n').filter((l) => l !== '').length
}
