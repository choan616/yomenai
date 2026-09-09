// 읽기 오답 상세 화면 — 음독 분해 + 한국 한자음 대조 + 같은 음독을 쓰는 다른 숙어 (PLAN §7)
import { useEffect, useState } from 'react'
import { loadKanji, loadPairs, type RuntimeIdiom } from '../dict/load.ts'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import type { MistakeType } from '../core/types.ts'
import {
  breakdown,
  contrastGroups,
  sharedIdioms,
  type BreakdownPart,
  type ContrastGroup,
  type SharedIdiom,
} from './mistakeDetail.ts'
import { MISTAKE_ADVICE, MISTAKE_LABEL, RULE_MISTAKES } from './mistakeLabels.ts'

interface Props {
  idiom: RuntimeIdiom
  /** 방금 붙은 오답 유형. 규칙형이면 해설 한 줄을 대조 바로 위에 놓는다 (Phase 11) */
  mistakeType: MistakeType | null
  onClose: () => void
}

export function MistakeDetail({ idiom, mistakeType, onClose }: Props) {
  const [parts, setParts] = useState<BreakdownPart[] | null>(null)
  const [shared, setShared] = useState<Map<string, SharedIdiom[]>>(new Map())
  const [contrast, setContrast] = useState<Map<string, ContrastGroup[]>>(new Map())

  useEffect(() => {
    let alive = true
    void Promise.all([loadPairs(), loadKanji(), loadPairIndex()]).then(([pairs, kanji, index]) => {
      if (!alive) return
      const bd = breakdown(idiom, pairs, kanji)
      const lookup = mistakeContextFromKanji(kanji).lookup
      const m = new Map<string, SharedIdiom[]>()
      const c = new Map<string, ContrastGroup[]>()
      for (const p of bd) {
        m.set(p.pairId, sharedIdioms(p.pairId, index, idiom.idiomId, 4))
        c.set(p.pairId, contrastGroups(p.pairId, p.base, index, lookup, idiom.idiomId))
      }
      setParts(bd)
      setShared(m)
      setContrast(c)
    })
    return () => {
      alive = false
    }
  }, [idiom])

  const advice = mistakeType !== null && RULE_MISTAKES.has(mistakeType) ? mistakeType : null

  return (
    <div className="card mistake-detail">
      <div className="card-head md-head">
        <span className="tag">오답 상세</span>
        <button type="button" className="link" onClick={onClose} aria-label="오답 상세 닫기">
          ✕
        </button>
      </div>

      <div className="card-body md-body">
        <p className="headword sm" lang="ja">
          {idiom.headword}
        </p>
        <p className="reading-shown" lang="ja">
          {idiom.reading}
        </p>

        {/* 해설은 규칙형 오답에만. 대조 바로 위에 놓아 "무엇을 볼지" 가리키는 라벨로 쓴다 */}
        {advice && (
          <p className="md-rule">
            <span className="tag">{MISTAKE_LABEL[advice]}</span>
            <span className="md-rule-text">{MISTAKE_ADVICE[advice]}</span>
          </p>
        )}

        {parts === null ? (
        <p className="dim md-note">불러오고 있어요…</p>
      ) : parts.length === 0 ? (
        <p className="dim md-note">이 숙어는 음독 분해 정보가 없어요.</p>
      ) : (
        <ul className="md-parts">
          {parts.map((p) => (
            <li key={p.pairId} className="md-part">
              <div className="md-part-head">
                <span className="md-kanji" lang="ja">
                  {p.kanji}
                </span>
                <span className="md-yomi" lang="ja">
                  {p.base}
                </span>
                <span className="tag muted">{p.kind === 'on' ? '음독' : '훈독'}</span>
                <span className="md-kr">
                  한국음 {p.kr.length > 0 ? p.kr.join('·') : '—'}
                  {p.krOld.length > 0 && (
                    <span className="md-kr-old"> · 옛 음 {p.krOld.join('·')}</span>
                  )}
                </span>
              </div>
              {(contrast.get(p.pairId)?.length ?? 0) >= 2 ? (
                <Contrast groups={contrast.get(p.pairId)!} />
              ) : (
                (shared.get(p.pairId)?.length ?? 0) > 0 && (
                  <p className="md-shared">
                    <span className="dim">같은 음독</span>{' '}
                    {shared.get(p.pairId)!.map((s) => (
                      <span key={s.id} className="md-shared-item" lang="ja">
                        {s.headword}
                        <span className="dim"> {s.reading}</span>
                      </span>
                    ))}
                  </p>
                )
              )}
            </li>
          ))}
        </ul>
        )}
      </div>

      <div className="card-bottom">
        <div className="answer-row">
          <span className="slot" aria-hidden="true" />
          <button type="button" className="btn-primary" onClick={onClose}>
            닫기
          </button>
          <span className="slot" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

/**
 * 대조 — 같은 음독이 실제로 다르게 소리 난 두 무리를 나란히.
 *
 * 평평한 목록이 "같은 음독을 쓰는 것들"까지만 말한다면, 이건 **규칙이 걸린 자리와 안 걸린
 * 자리**를 보여준다. 한쪽만 반복해 보면 과잉일반화가 생겨 새 오답이 만들어진다
 * (context-notes 2026-09-07).
 */
function Contrast({ groups }: { groups: ContrastGroup[] }) {
  return (
    <div className="md-contrast">
      {groups.map((g) => (
        <p key={g.surface} className={`md-cg${g.current ? ' now' : ''}`}>
          <span className="md-cg-surface" lang="ja">
            {g.surface}
          </span>
          <span className="md-cg-mark">{g.plain ? '그대로' : '변해요'}</span>
          <span className="md-cg-items">
            {g.idioms.map((s) => (
              <span key={s.id} className="md-shared-item" lang="ja">
                {s.headword}
                <span className="dim"> {s.reading}</span>
              </span>
            ))}
          </span>
        </p>
      ))}
    </div>
  )
}
