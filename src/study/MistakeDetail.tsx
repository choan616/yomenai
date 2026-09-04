// 읽기 오답 상세 화면 — 음독 분해 + 한국 한자음 대조 + 같은 음독을 쓰는 다른 숙어 (PLAN §7)
import { useEffect, useState } from 'react'
import { loadKanji, loadPairs, type RuntimeIdiom } from '../dict/load.ts'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { breakdown, sharedIdioms, type BreakdownPart, type SharedIdiom } from './mistakeDetail.ts'

interface Props {
  idiom: RuntimeIdiom
  onClose: () => void
}

export function MistakeDetail({ idiom, onClose }: Props) {
  const [parts, setParts] = useState<BreakdownPart[] | null>(null)
  const [shared, setShared] = useState<Map<string, SharedIdiom[]>>(new Map())

  useEffect(() => {
    let alive = true
    void Promise.all([loadPairs(), loadKanji(), loadPairIndex()]).then(([pairs, kanji, index]) => {
      if (!alive) return
      const bd = breakdown(idiom, pairs, kanji)
      const m = new Map<string, SharedIdiom[]>()
      for (const p of bd) m.set(p.pairId, sharedIdioms(p.pairId, index, idiom.idiomId, 4))
      setParts(bd)
      setShared(m)
    })
    return () => {
      alive = false
    }
  }, [idiom])

  return (
    <div className="card mistake-detail">
      <div className="card-head md-head">
        <span className="tag">오답 상세</span>
        <button type="button" className="link" onClick={onClose} aria-label="오답 상세 닫기">
          ✕
        </button>
      </div>

      <p className="headword sm" lang="ja">
        {idiom.headword}
      </p>
      <p className="reading-shown" lang="ja">
        {idiom.reading}
      </p>

      {parts === null ? (
        <p className="dim md-note">불러오는 중…</p>
      ) : parts.length === 0 ? (
        <p className="dim md-note">이 숙어는 음독 분해 정보가 없습니다.</p>
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
                <span className="md-kr">한국음 {p.kr.length > 0 ? p.kr.join('·') : '—'}</span>
              </div>
              {(shared.get(p.pairId)?.length ?? 0) > 0 && (
                <p className="md-shared">
                  <span className="dim">같은 음독</span>{' '}
                  {shared.get(p.pairId)!.map((s) => (
                    <span key={s.id} className="md-shared-item" lang="ja">
                      {s.headword}
                      <span className="dim"> {s.reading}</span>
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="card-bottom">
        <div className="answer-row">
          <button type="button" className="btn-primary wide" onClick={onClose}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
