// slim kanji.json 레코드({kr,on,kun})를 오답 판정용 MistakeContext 로 어댑트한다
import { buildKoSiblingIndex, type MistakeContext } from '../core/mistakes.ts'
import type { KanjiInfo } from './load.ts'

export function mistakeContextFromKanji(kanji: Map<string, KanjiInfo>): MistakeContext {
  return {
    lookup: (k) => {
      const r = kanji.get(k)
      return r ? { onyomi: r.on, kunyomi: r.kun } : undefined
    },
    koSiblingOnyomi: buildKoSiblingIndex(
      Object.fromEntries([...kanji].map(([k, v]) => [k, { koreanH: v.kr, onyomi: v.on }])),
    ),
  }
}
