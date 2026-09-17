// 읽기 오답 상세 화면 — 음독 분해 + 한국 한자음 대조 + 같은 음독을 쓰는 다른 숙어 (PLAN §7)
import { useEffect, useState } from 'react'
import { loadKanji, loadPairs, type RuntimeIdiom } from '../dict/load.ts'
import { loadPairIndex } from '../dict/pairIndex.ts'
import { mistakeContextFromKanji } from '../dict/mistakeContext.ts'
import type { MistakeType } from '../core/types.ts'
import { rubyOf, type RubySegment } from '../core/ruby.ts'
import {
  breakdown,
  contrastGroups,
  sharedIdioms,
  type BreakdownPart,
  type ContrastGroup,
  type SharedIdiom,
} from './mistakeDetail.ts'
import { mistakeHint, mistakeLabel, RULE_MISTAKES } from './mistakeLabels.ts'
import { Mixed, RuleBody } from '../app/RuleBody.tsx'
import { ruleForMistake, ruleSection } from '../app/rules.ts'
import type { VoicingKind } from '../core/mistakes.ts'

interface Props {
  idiom: RuntimeIdiom
  /** 방금 붙은 오답 유형. 규칙형이면 해설 한 줄을 대조 바로 위에 놓는다 (Phase 11) */
  mistakeType: MistakeType | null
  /** RENDAKU 안에서 어느 갈래였나 (2026-09-17). 펼칠 절과 이름을 이게 정한다 */
  voicing?: VoicingKind | null
  onClose: () => void
}

export function MistakeDetail({ idiom, mistakeType, voicing = null, onClose }: Props) {
  const [parts, setParts] = useState<BreakdownPart[] | null>(null)
  const [shared, setShared] = useState<Map<string, SharedIdiom[]>>(new Map())
  const [contrast, setContrast] = useState<Map<string, ContrastGroup[]>>(new Map())
  /** 한자 위에 얹을 읽기. 사전이 오기 전에는 null 이라 읽기를 따로 한 줄로 보여준다 */
  const [ruby, setRuby] = useState<RubySegment[] | null>(null)

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
      setRuby(rubyOf(idiom.headword, idiom.reading, lookup))
      setParts(bd)
      setShared(m)
      setContrast(c)
    })
    return () => {
      alive = false
    }
  }, [idiom])

  const advice = mistakeType !== null && RULE_MISTAKES.has(mistakeType) ? mistakeType : null
  /**
   * 아래에 펼칠 규칙 절. 위의 advice 와 기준이 다르다 — 카드 한 줄은 RULE_MISTAKES 경계를
   * 그대로 쓰지만(2026-09-07), 여기는 오버레이라 자리가 있어 KO_INTERFERENCE(종성 대응)
   * 절까지 펼친다
   */
  const ruleId = ruleForMistake(mistakeType, voicing)
  const rule = ruleId === null ? undefined : ruleSection(ruleId)

  return (
    <div className="card mistake-detail">
      <div className="card-head md-head">
        <span className="tag">오답 상세</span>
        <button type="button" className="link" onClick={onClose} aria-label="오답 상세 닫기">
          ✕
        </button>
      </div>

      <div className="card-body md-body">
        {/* 설명 카드는 한자 위에 읽기를 얹는다 (2026-09-14) — 줄을 따로 두면 눈이 두 번
            움직이고 글자와 소리의 대응을 직접 맞춰야 한다 */}
        {ruby === null ? (
          <>
            <p className="headword sm" lang="ja">
              {idiom.headword}
            </p>
            <p className="reading-shown" lang="ja">
              {idiom.reading}
            </p>
          </>
        ) : (
          <p className="headword sm has-ruby" lang="ja">
            {ruby.map((r, i) => (
              <ruby key={i}>
                {r.text}
                <rt>{r.rt}</rt>
              </ruby>
            ))}
          </p>
        )}

        {/* 해설은 규칙형 오답에만. 대조 바로 위에 놓아 "무엇을 볼지" 가리키는 라벨로 쓴다 */}
        {advice && (
          <p className="md-rule">
            <span className="tag">{mistakeLabel(advice, voicing)}</span>
            <span className="md-rule-text">
              <Mixed text={mistakeHint(advice, voicing)} />
            </span>
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

        {/* 규칙 심화 (2026-09-17) — 위의 한 줄이 "무슨 유형인지" 라면 여기는 "왜 그런지" 다.
            세션 중에 규칙 화면으로 나가면 세션 큐가 초기화되므로 그 절을 여기서 인라인으로
            펼친다. 전체 지도는 홈·리포트에서 연다 (context-notes 2026-09-17) */}
        {rule && (
          <div className="md-rule-more">
            <p className="md-rule-more-title">
              왜 그런가 — <Mixed text={rule.title} />
            </p>
            <RuleBody section={rule} short />
            <p className="md-rule-more-tail dim">
              규칙 전체는 리포트의 「읽기 규칙」에서 볼 수 있어요.
            </p>
          </div>
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
