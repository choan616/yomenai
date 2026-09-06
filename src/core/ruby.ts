// 정답 공개용 루비(후리가나) 분해 — 한자 위에 그 자리의 읽기를 얹는다.
// 아래에 읽기를 한 줄 더 놓는 것과 달리 "고쳐진" 감각이 남는다 (校正紙 컨셉)
import { decompose, type KanjiReadings } from '../lib/onyomi.ts'

export interface RubySegment {
  /** 표기 (한자 1자, 또는 분해 실패 시 숙어 전체) */
  text: string
  /** 그 자리의 읽기 */
  rt: string
}

/**
 * 숙어를 (한자, 그 자리 읽기) 조각으로 나눈다.
 * Phase 2 의 최소 비용 분해를 그대로 쓴다. 분해가 안 되면(熟字訓 등) 통째로 하나만 낸다 —
 * `<ruby>特徴<rt>とくちょう</rt></ruby>` 도 여전히 유효한 루비다.
 */
export function rubyOf(
  headword: string,
  reading: string,
  lookup: (kanji: string) => KanjiReadings | undefined,
): RubySegment[] {
  const chars = [...headword]
  const d = decompose(headword, reading, lookup)
  if (!d.ok || d.segments.length !== chars.length) return [{ text: headword, rt: reading }]
  return chars.map((text, i) => ({ text, rt: d.segments[i].surface }))
}
