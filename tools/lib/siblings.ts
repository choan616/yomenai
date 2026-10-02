// 같은 JMdict 항목의 다른 읽기를 「형제 항목」으로 조립한다 (context-notes 2026-10-02 「읽기 둘 항목으로」)
//
// 임포트는 한 항목에서 읽기를 하나만 골라서, 逆手 의 `ぎゃくて`(foul trick) 같은 읽기가 사전에 없었다.
// `build-extra-readings.ts` 가 빠진 읽기를 뽑아 두면, 여기서 그중 **뜻이 갈린 읽기**를 별도 항목으로 올린다.
// 뜻이 같은 읽기는 항목이 아니라 채점만 받아준다(`altReadings`).
//
// 항목이 못 되는 경우는 채점만으로 **내린다**(demoted) — 음독 분해가 안 되는 읽기는 학습 장치가 하나도 안
// 붙으므로 항목으로 올려 봐야 쓸 곳이 없다.
import { toRomaji } from 'wanakana'
import { bandOf, type Band } from '../../src/lib/bands.ts'
import { decompose, pairId, type KanjiReadings } from '../../src/lib/onyomi.ts'
import type { Extras } from '../build-extra-readings.ts'

export interface ParentInfo {
  id: string
  headword: string
  reading: string
  pos: string[]
}

export interface MeaningOverride {
  definition: string
  source: 'llm' | 'manual'
  verified: boolean
}

export interface Sibling {
  /** `{JMdict id}-{romaji}` — 학습 기록이 영구히 참조하는 값이라 한 번 정하면 못 바꾼다 */
  id: string
  parentId: string
  headword: string
  reading: string
  pos: string[]
  band: Band
  common: boolean
  pairIds: string[]
  readingKind: 'on' | 'mix' | 'kun'
  koMeaning: MeaningOverride | null
}

export interface SiblingResult {
  siblings: Sibling[]
  /** 항목이 되려다 채점만으로 내려간 읽기 — 부모 id 별로 모은다 */
  demotedByParent: Map<string, string[]>
  /** 항목이 못 되는 사유 집계 */
  demoted: { parentId: string; reading: string; reason: string }[]
  /** 형제 항목이 쓰는 (한자, 음독) 쌍 — `pairs.json` 에 없으면 채워야 한다 */
  pairs: Map<string, { kanji: string; base: string; kind: 'on' | 'kun' }>
}

/** 결합 부호(U+0300~036F) — 이스케이프를 안 쓰고 코드 값으로 만든다 */
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/**
 * 형제 항목의 id. 읽기를 로마자로 바꿔 붙인다.
 *
 * - 순번(`-2`)은 JMdict 가 읽기 순서를 바꾸면 기록이 엉뚱한 읽기에 붙어 안 쓴다
 * - 가나 그대로는 NFC/NFD 차이가 어딘가에서 생기면 같은 id 가 둘로 갈린다(탁음이 든 읽기에서 실제로 생긴다).
 *   **입력도 NFC 로 맞춘다** — 결합형 탁점(き + ゙)을 wanakana 가 그대로 `ki` 로 바꾸고 탁점을 버려서,
 *   정규화 없이는 같은 읽기가 NFD 로 들어오면 id 가 `gyu…` 대신 `ki-yu…` 가 된다 (테스트가 잡았다)
 * - 장음·악센트 기호는 떼고, 그 밖의 기호(`ん` 뒤의 아포스트로피 등)는 `-` 로 바꾼다
 */
export function siblingId(parentId: string, reading: string): string {
  const romaji = toRomaji(reading.normalize('NFC'))
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${parentId}-${romaji}`
}

function readingKindOf(kinds: ('on' | 'kun')[]): 'on' | 'mix' | 'kun' {
  const on = kinds.filter((k) => k === 'on').length
  if (on === 0) return 'kun'
  return on === kinds.length ? 'on' : 'mix'
}

export function buildSiblings(
  parents: ParentInfo[],
  extras: Record<string, Extras>,
  lookupKanji: (k: string) => KanjiReadings | undefined,
  meanings: Record<string, MeaningOverride>,
  /** 이미 있는 `표기 읽기` 키 — 같은 말이 JMdict 에서 따로 항목으로 있으면 만들지 않는다(一目 いちもく) */
  existingKeys: Set<string>,
): SiblingResult {
  const siblings: Sibling[] = []
  const demotedByParent = new Map<string, string[]>()
  const demoted: SiblingResult['demoted'] = []
  const pairs: SiblingResult['pairs'] = new Map()
  const seenIds = new Set<string>()

  const demote = (parentId: string, reading: string, reason: string) => {
    demoted.push({ parentId, reading, reason })
    const list = demotedByParent.get(parentId) ?? []
    list.push(reading)
    demotedByParent.set(parentId, list)
  }

  for (const p of parents) {
    const ex = extras[p.id]
    if (!ex) continue
    for (const s of ex.split) {
      if (existingKeys.has(`${p.headword} ${s.reading}`)) {
        // 이미 따로 항목이 있다. 만들면 같은 카드가 둘이 된다
        demote(p.id, s.reading, '이미 항목')
        continue
      }
      const d = decompose(p.headword, s.reading, lookupKanji)
      if (!d.ok) {
        demote(p.id, s.reading, `분해 실패 ${d.reason}`)
        continue
      }
      const id = siblingId(p.id, s.reading)
      if (seenIds.has(id)) throw new Error(`형제 id 가 겹친다: ${id} (${p.headword} ${s.reading})`)
      seenIds.add(id)

      // 밴드는 그 읽기 자신의 빈도로만 정한다. 표기의 순위를 물려받지 않는다 (extra-readings 주석 참조)
      const priority = s.readingPriority
      const kinds = d.segments.map((g) => g.kind)
      for (const g of d.segments) {
        pairs.set(pairId(g.kanji, g.base, g.kind), { kanji: g.kanji, base: g.base, kind: g.kind })
      }
      siblings.push({
        id,
        parentId: p.id,
        headword: p.headword,
        reading: s.reading,
        pos: p.pos,
        band: bandOf({ priority }),
        common: priority.length > 0,
        pairIds: d.segments.map((g) => pairId(g.kanji, g.base, g.kind)),
        readingKind: readingKindOf(kinds),
        koMeaning: meanings[id] ?? null,
      })
    }
  }
  return { siblings, demotedByParent, demoted, pairs }
}
